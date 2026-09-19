import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mergeParentLessons } from '../src/lib/parentLessonCompatibility.mjs';
import { buildParentTermSummary } from '../src/lib/parentReport.mjs';
import { calculateSummary } from '../src/lib/behaviorSummary.mjs';
import { matchingSubmissionEntries, projectSubmissionStatus } from '../src/lib/scoreSubmissionPlan.mjs';

test('new admin attendance correction wins over stale parent copy without losing comments',()=>{
  const entries=[{id:'2026-09-10',source:'public',data:{attendance:'present',updatedAt:100,comments:[{id:'good',text:'集中できました。'}]}},{id:'2026-09-10',source:'common',data:{status:'absent',updatedAt:200,note:'PRIVATE'}}];
  for(const items of [entries,[...entries].reverse()]){
    const record=mergeParentLessons(items).get('2026-09-10');
    assert.equal(record.attendance,'absent');assert.equal(record.comments[0].text,'集中できました。');
    assert.equal(JSON.stringify(record).includes('PRIVATE'),false);
  }
});
test('cancellation stays cancelled while original homework remains visible',()=>{
  const rows=mergeParentLessons([{id:'2026-09-10',source:'legacy',data:{attendance:'present',homework:'submitted',updatedAt:100}},{id:'2026-09-10',source:'common',data:{status:null,attendance:null,updatedAt:200}}]);
  const summary=buildParentTermSummary([...rows.values()],[]);
  assert.equal(summary.lessons,0);assert.equal(summary.homework.submitted,1);
});
test('manual homework is included once even when there is also a published assignment',()=>{
  const records=[{date:'2026-09-10',homework:'submitted'},{date:'2026-09-11',homework:'missed'}];
  const summary=buildParentTermSummary(records,[{review:{date:'2026-09-10',status:'submitted'}}]);
  assert.equal(summary.homework.submitted,1);assert.equal(summary.homework.missed,1);
});
test('teacher record can update the same summary used by the admin graphs, including zero marks',()=>{
  const summary=calculateSummary([{attendance:'present',homework:'partial',wordTest:{status:'completed',correct:0,total:30},late:false,forgot:true}],2026,2);
  assert.equal(summary.wordTest.completed,1);assert.equal(summary.wordTest.totalCorrect,0);
  assert.equal(summary.wordTest.totalQuestions,30);assert.equal(summary.homework.partial,1);
  assert.equal(summary.forgot,1);assert.equal(summary.term,'2学期');
});
test('parent context only requests and exposes linked children submission status',async()=>{
  const paths=[];const data={'users/alice':{grade:8,realName:'Alice'},'scoreSubmissionTerms/2026_2/students/alice':{examReceived:true}};
  const ref=path=>({collection:part=>ref(`${path}/${part}`),doc:part=>ref(`${path}/${part}`),get:async()=>{paths.push(path);if(path==='scoreSubmissionCalendars/2026/entries')return{docs:[]};return {exists:Object.hasOwn(data,path),data:()=>data[path]||{}}}});
  const context={Response,requireParent:async()=>({uid:'parent',role:'parent',profile:{displayName:'Parent'}}),linkedChildren:async()=>['user_alice'],adminDb:{collection:ref},readAcademicSettings:async()=>[],resolveAcademicTerm:()=>({id:'2026_2'}),japanDateId:()=> '2026-09-13',matchingSubmissionEntries,projectSubmissionStatus};
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../src/app/api/parent/context/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ',''),context);
  const result=await (await context.GET({})).json();assert.deepEqual(Object.keys(result.submissionStatus),['alice']);
  assert.equal(result.submissionStatus.alice.examReceived,true);
  assert.equal(paths.includes('scoreSubmissionTerms/2026_2/students'),false);
});
test('parent score rejects blank marks and other children before writing',async()=>{
  const source=fs.readFileSync(new URL('../src/app/api/parent/scores/route.js',import.meta.url),'utf8');
  for(const [key,exam] of [['user_alice',{'国語':'','社会':50,'数学':50,'理科':50,'英語':50}],['user_bob',{}]]){
    const writes=[];const ref=path=>({collection:part=>ref(`${path}/${part}`),doc:part=>ref(`${path}/${part||'new'}`),where:()=>ref(path),get:async()=>({exists:true,data:()=>({grade:8})})});
    const context={Response,FieldValue:{serverTimestamp:()=>100},requireParent:async()=>({uid:'parent',role:'parent'}),linkedChildren:async()=>['user_alice'],normalizeStudentKey:key=>key,adminDb:{collection:ref,runTransaction:async fn=>fn({get:async()=>({docs:[]}),set:(...args)=>writes.push(args)})}};
    vm.createContext(context);vm.runInContext(source.replace(/^import .*\n/gm,'').replaceAll('export ',''),context);
    const response=await context.POST({json:async()=>({student:key,type:'exam',testType:'期末',year:'2026',term:'2学期',exam})});
    assert.ok(response.status>=400);assert.equal(writes.length,0);
  }
});
