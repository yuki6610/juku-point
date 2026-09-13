import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTermHistory } from '../src/lib/termLedger.mjs';
const period={start:'2026-09-03',end:'2026-12-26'};
test('effective corrections do not become fresh earnings on rebuild',()=>{
 const summary=summarizeTermHistory([{type:'homework_undo',amount:50,sourceDate:'2026-09-10'},{type:'homework_undo',amount:-50,sourceDate:'2026-09-11'},{type:'homework_partial',amount:-25,sourceDate:'2026-09-12'},{type:'homework',amount:50,sourceDate:'2026-09-13'}],period);
 assert.equal(summary.termPoints,25);assert.equal(summary.termHomeworkCount,1);
});
test('term boundaries keep new term gains out of old archive and exclude spending',()=>{
 const rows=[{type:'homework',amount:50,sourceDate:'2026-09-02'},{type:'homework',amount:50,sourceDate:'2026-09-03'},{type:'reward',amount:-500,sourceDate:'2026-09-03'},{type:'gacha',amount:-500,sourceDate:'2026-09-03',affectsEarnedPoints:false},{type:'wordtest',amount:0,correct:0,total:30,sourceDate:'2026-09-04'}];
 const summary=summarizeTermHistory(rows,period);assert.equal(summary.termPoints,50);assert.equal(summary.termWordTestCount,1);assert.equal(summary.termRewardsCount,1);
});
