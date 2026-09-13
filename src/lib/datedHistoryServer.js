import { FieldPath } from 'firebase-admin/firestore';
import { japanDateId } from './academicCalendar.mjs';
// Read bounded months using the default ascending document index. Avoid name-DESC indexes.
export async function datedHistoryPage(ref,before=null,size=50){
  const first=await ref.orderBy(FieldPath.documentId()).limit(1).get();
  if(first.empty)return {docs:[],next:null};
  const earliest=first.docs[0].id;
  let upper=before||japanDateId(new Date(Date.now()+86400000)),rows=[];
  while(upper>earliest&&rows.length<=size){
    const previous=new Date(`${upper}T00:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);
    const lower=previous.toISOString().slice(0,7)+'-01';
    const page=await ref.where(FieldPath.documentId(),'>=',lower).where(FieldPath.documentId(),'<',upper).get();
    rows.push(...page.docs);upper=lower;
  }
  rows.sort((a,b)=>b.id.localeCompare(a.id));return {docs:rows.slice(0,size),next:rows.length>size?rows[size-1].id:null};
}
