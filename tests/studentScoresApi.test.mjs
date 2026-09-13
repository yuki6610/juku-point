import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/app/api/student/scores/route.js',import.meta.url),'utf8');
async function request(body,profile={grade:8},existing=[]){
 const writes=[],reads=[];
 const ref=path=>({path,collection:key=>ref(`${path}/${key}`),doc:key=>ref(`${path}/${key||'generated'}`),where:()=>ref(path),get:async()=>{reads.push(path);return{exists:true,data:()=>profile}}});
 const context={Response,console,adminAuth:{verifyIdToken:async()=>({uid:'alice'})},FieldValue:{serverTimestamp:()=>100},readAcademicSettings:async()=>[{year:2026,terms:{2:{start:'2026-09-03',end:'2026-12-26'}}}],adminDb:{collection:ref,runTransaction:async callback=>callback({get:async target=>{reads.push(target.path);return{docs:existing.map(data=>({data:()=>data}))}},set:(target,data)=>writes.push({path:target.path,data})})}};
 vm.createContext(context);vm.runInContext(source.replace(/^import .*\n/gm,'').replaceAll('export ',''),context);
 const response=await context.POST({headers:{get:()=> 'Bearer test'},json:async()=>body});return{response,writes,reads};
}
const exam={type:'exam',year:'2026',term:'2学期',testType:'中間',exam:{国語:0,社会:60,数学:70,理科:80,英語:90}};
test('student scores use the authenticated child and calculate totals on the server',async()=>{
 const result=await request({...exam,uid:'bob',student:'user_bob',examTotal:999});assert.equal(result.response.status,200);assert.equal(result.writes[0].path,'users/alice/scores/generated');assert.equal(result.writes[0].data.examTotal,300);assert.equal(result.writes[0].data.submittedBy,'student');
});
test('blank, excessive, fractional and duplicate scores cannot write',async()=>{
 for(const value of ['',101,1.5]){const result=await request({...exam,exam:{...exam.exam,数学:value}});assert.equal(result.response.status,400);assert.equal(result.writes.length,0)}
 const duplicate=await request(exam,{grade:8},[{type:'exam',testType:'中間'}]);assert.equal(duplicate.response.status,400);assert.equal(duplicate.writes.length,0);
});
test('withdrawn and high school students cannot use the middle-school score endpoint',async()=>{
 for(const profile of [{grade:10},{grade:8,active:false},{grade:8,enrollmentStatus:'withdrawn'}]){const result=await request(exam,profile);assert.equal(result.response.status,400);assert.equal(result.writes.length,0)}
});
