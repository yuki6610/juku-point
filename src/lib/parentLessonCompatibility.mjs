const time = value => value?.toMillis?.() ?? (value?.seconds ? value.seconds*1000 : typeof value==='number'?value:Date.parse(value||'')||0);
const has = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
// Merge by update time, but expose only fields intended for families.
export function mergeParentLessons(entries) {
  const rows = new Map();
  const rank={legacy:0,public:1,common:2};
  for(const {id,data,source} of [...entries].sort((a,b)=>time(a.data.updatedAt)-time(b.data.updatedAt)||(rank[a.source]||0)-(rank[b.source]||0))) {
    const learning=data.learningRecord||data;
    const row=rows.get(id)||{date:id,termId:null,attendance:null,late:false,forgot:false,forgotItems:[],forgotOther:'',wordTest:null,comments:[],homeworkResult:null,learningContent:'',lessonReport:null};
    if(data.termId||learning.termId)row.termId=data.termId||learning.termId;
    if(has(data,'status'))row.attendance=data.status;
    else if(has(data,'attendance'))row.attendance=data.attendance;
    for(const field of ['late','forgot'])if(has(learning,field))row[field]=learning[field]===true;
    if(source==='public'){row.forgotItems=Array.isArray(data.forgotItems)?data.forgotItems:[];row.forgotOther=String(data.forgotOther||'').slice(0,200)}
    if(['none','submitted','partial','missed','notEvaluated'].includes(learning.homework))row.homework=learning.homework;
    if(has(learning,'wordTest')){const word=learning.wordTest;row.wordTest=word?{status:word.status,...(['completed','makeup'].includes(word.status)?{correct:Number(word.correct||0),total:Number(word.total||0)}:{})}:null}
    if(source==='public'){
      row.comments=(data.comments||[]).map(item=>({id:item.id,text:item.text}));
      row.homeworkResult=data.homeworkResult?{status:data.homeworkResult.status,text:data.homeworkResult.text,date:data.homeworkResult.date}:null;
      row.learningContent=String(data.learningContent||'').slice(0,500);
      row.lessonReport=data.lessonReport?.text?{version:Number(data.lessonReport.version||1),text:String(data.lessonReport.text).slice(0,1500)}:null;
    }
    rows.set(id,row);
  }
  return rows;
}
