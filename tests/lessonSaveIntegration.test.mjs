import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { calculateSummary } from '../src/lib/behaviorSummary.mjs';
import { DEFAULT_HOMEWORK_TEMPLATES, aggregateItemResults, homeworkValue, publicAssignment } from '../src/lib/homeworkModel.mjs';
import { resolveAcademicTerm } from '../src/lib/academicCalendar.mjs';

async function save(role,override={},initial={}) {
  const recordRoot='users/student000/lessonTerms/2026_2/records';
  const data={'users/student000':{grade:8,points:0,totalEarnedPoints:0},[`${recordRoot}/2026-09-09`]:{attendance:'absent',homework:'notEvaluated'}};
  Object.assign(data,initial);
  const writes=[];
  const snapshot=path=>path.split('/').length%2?{docs:Object.entries(data).filter(([key])=>key.startsWith(`${path}/`)&&key.slice(path.length+1).indexOf('/')===-1).map(([key,value])=>({id:key.split('/').at(-1),data:()=>value}))}:{exists:Object.hasOwn(data,path),data:()=>data[path]};
  const ref=path=>({path,get parent(){return ref(path.split('/').slice(0,-1).join('/'))},collection:part=>ref(`${path}/${part}`),doc:part=>ref(`${path}/${part||'generated'}`),get:async()=>snapshot(path)});
  const context={Response,console,DEFAULT_HOMEWORK_TEMPLATES,aggregateItemResults,homeworkValue,publicAssignment,calculateSummary,resolveAcademicTerm,japanDateId:()=> '2026-09-10',readAcademicSettings:async()=>[{year:2026,terms:{2:{start:'2026-09-03',end:'2026-12-26'}}}],requireStaff:async()=>({uid:role,role}),assertAssigned:()=>{},FieldValue:{serverTimestamp:()=>100},Timestamp:{fromDate:date=>date},adminDb:{collection:ref,runTransaction:async fn=>fn({get:async target=>{assert.equal(writes.length,0);return snapshot(target.path)},set:(target,value)=>writes.push({path:target.path,value}),update:(target,value)=>writes.push({path:target.path,value}),delete:target=>writes.push({path:target.path,deleted:true})})}};
  vm.createContext(context);
  for(const path of ['../src/lib/homeworkServer.js','../src/app/api/admin/lesson-records/route.js'])vm.runInContext(fs.readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ',''),context);
  const response=await context.POST({json:async()=>({uid:'student000',date:'2026-09-10',termId:'2026_2',weekId:'2026-W37',commentIds:['focus'],record:{attendance:'present',homework:'submitted',wordTest:{status:'completed',correct:0,total:30},late:false,forgot:false,behaviorNote:'PRIVATE: classroom only',...override}})});
  assert.equal(response.status,200,JSON.stringify(await response.json()));return writes;
}
test('admin and teacher saves both update the shared behavior graph and parent publication',async()=>{
  for(const role of ['admin','teacher']){
    const writes=await save(role),summary=writes.find(item=>item.path==='users/student000/behaviorSummary/2026_2').value;
    assert.equal(summary.attendance.absent,1);assert.equal(summary.attendance.ontime,1);assert.equal(summary.homework.submitted,1);
    assert.equal(summary.wordTest.completed,1);assert.equal(summary.wordTest.totalCorrect,0);
    const publication=writes.find(item=>item.path==='lessonPublic/user_student000/records/2026-09-10').value;
    assert.equal(publication.comments[0].text,'集中して取り組めていました。');
    assert.equal(JSON.stringify(publication).includes('PRIVATE'),false);
    assert.equal(writes.find(item=>item.path==='studentProfiles/user_student000').value.teacherMemo,'PRIVATE: classroom only');
  }
});
test('submitted cancellation has zero effective history, matching the rebuilt balance',async()=>{
  const writes=await save('admin',{homework:'none'},{'users/student000':{grade:8,points:50,termPoints:50,totalEarnedPoints:50},'users/student000/lessonRewards/2026_2_2026-09-10_homework':{sourceDate:'2026-09-10',amount:50}});
  assert.equal(writes.find(item=>item.path==='users/student000').value.points,0);
  assert.equal(writes.find(item=>item.path.endsWith('/pointHistory/lesson_2026_2_2026-09-10_homework')).value.amount,0);
});
test('partial cancellation refunds 25 but does not record a new 50 point earning',async()=>{
  const writes=await save('admin',{homework:'none'},{'users/student000':{grade:8,points:75,termPoints:75,totalEarnedPoints:100},'users/student000/lessonRewards/2026_2_2026-09-10_homework_missed':{sourceDate:'2026-09-10',amount:-25}});
  assert.equal(writes.find(item=>item.path==='users/student000').value.points,100);
  assert.equal(writes.find(item=>item.path.endsWith('/pointHistory/lesson_2026_2_2026-09-10_homework_missed')).value.amount,0);
});
