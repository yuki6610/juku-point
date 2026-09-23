const text = (value, max = 500) => String(value || '').trim().slice(0, max);
const score = value => { const legacy={low:2,needsSupport:2,partial:3,some:4,normal:3,strong:5,high:5,active:5,completed:5};const number=Number(value);return number>=1&&number<=5?number:(legacy[value]||null); };

export function normalizeReportFacts(value = {}) {
  return Object.fromEntries(Object.entries({focus:score(value.focus),understanding:score(value.understanding),questions:score(value.questions),attitude:score(value.attitude??value.concern),subject:text(value.subject,30),supplement:text(value.supplement,500),extraNote:text(value.extraNote,2000)}).filter(([,entry])=>entry!==null&&entry!==''));
}
