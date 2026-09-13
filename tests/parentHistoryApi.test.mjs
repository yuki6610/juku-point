import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mergeParentLessons } from '../src/lib/parentLessonCompatibility.mjs';

test('parent history paginates all sources without descending name index and keeps old homework',async()=>{
  const data={'users/alice':{grade:8}};
  for(let day=3;day<=27;day++){const date=`2026-09-${String(day).padStart(2,'0')}`;data[`users/alice/lessonTerms/2026_2/records/${date}`]={date,attendance:'present'}}
  const ref=(path,conditions=[])=>({collection:part=>ref(`${path}/${part}`),doc:part=>ref(`${path}/${part}`),where:(field,operator,value)=>ref(path,[...conditions,[field,operator,value]]),get:async()=>{
    if(path.split('/').length%2===0)return {exists:Object.hasOwn(data,path),data:()=>data[path]};
    return {docs:Object.entries(data).filter(([key])=>key.startsWith(`${path}/`)&&!key.slice(path.length+1).includes('/')&&conditions.every(([,operator,value])=>{const id=key.split('/').at(-1);return operator==='>='?id>=value:operator==='<='?id<=value:id<value})).map(([key,value])=>({id:key.split('/').at(-1),data:()=>value}))};
  }});
  const context={URL,Response,FieldPath:{documentId:()=> '__name__'},adminDb:{collection:ref},requireParent:async()=>({uid:'parent',role:'parent'}),linkedChildren:async()=>['user_alice'],normalizeStudentKey:key=>key,readAcademicSettings:async()=>[{year:2026,terms:{2:{start:'2026-09-03',end:'2026-12-26'}}}],mergeParentLessons,readPublicHomeworkCompatible:async()=>[{id:'assignment1',assignedDate:'2026-09-04',dueDate:'2026-09-05',items:[],review:{date:'2026-09-05',status:'submitted'}}]};
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../src/app/api/parent/lessons/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ',''),context);
  const first=await (await context.GET({url:'https://example.test/?student=user_alice'})).json();
  assert.equal(first.lessons.length,20);assert.equal(first.lessons[0].date,'2026-09-27');
  const second=await (await context.GET({url:`https://example.test/?student=user_alice&after=${first.next}`})).json();
  assert.equal(second.lessons.length,5);assert.equal(second.next,null);
  assert.equal(second.lessons.find(item=>item.date==='2026-09-04').assignedHomework.length,1);
  assert.equal(second.lessons.find(item=>item.date==='2026-09-05').reviewedHomework.length,1);
  const blocked=await context.GET({url:'https://example.test/?student=user_bob'});assert.equal(blocked.status,403);
});
