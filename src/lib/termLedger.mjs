import { historyMillis } from './historyCompatibility.mjs';

// A history row is the effective award for its source, not an additive correction event.
export function summarizeTermHistory(rows, period) {
  const start=Date.parse(`${period.start}T00:00:00+09:00`),end=Date.parse(`${period.end}T00:00:00+09:00`)+86400000;
  const summary={termPoints:0,termWordScore:0,termWordTestCount:0,termHomeworkCount:0,termStudyMinutes:0,termSelfStudyCount:0,termRewardsCount:0};
  for(const row of rows){
    const time=row.sourceDate?Date.parse(`${row.sourceDate}T12:00:00+09:00`):historyMillis(row.createdAt||row.date);
    if(time<start||time>=end||!Number.isFinite(time))continue;
    if(row.type==='reward'){summary.termRewardsCount++;continue}
    if(row.affectsEarnedPoints===false||row.type==='gacha'||row.type==='homework_undo')continue;
    const amount=Number(row.amount??row.point??0);if(Number.isFinite(amount))summary.termPoints+=amount;
    if(row.type==='homework'&&amount>0)summary.termHomeworkCount++;
    if(row.type==='wordtest'){summary.termWordScore+=Number(row.scoreCorrect??row.correct??0);summary.termWordTestCount++}
    if(row.type==='selfstudy'){summary.termSelfStudyCount++;summary.termStudyMinutes+=Number(row.minutes??String(row.note||'').match(/自習\s*(\d+)\s*分/)?.[1]??0)}
  }
  return summary;
}
