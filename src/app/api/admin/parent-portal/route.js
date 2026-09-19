import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const dynamic = 'force-dynamic';
function validate(items, documents = false) {
  if (!Array.isArray(items) || items.length > 100) throw new Error('登録件数が多すぎます。');
  return items.map(item => {
    const value = { id: String(item.id || crypto.randomUUID()), title: String(item.title || '').trim().slice(0,120), body: String(item.body || '').trim().slice(0,1000), date: String(item.date || '').slice(0,10), priority: ['important','request','normal'].includes(item.priority) ? item.priority : 'normal', startDate:String(item.startDate||'').slice(0,10),endDate:String(item.endDate||'').slice(0,10),targetType:['all','elementary','middle','grade','school','student','parentTag'].includes(item.targetType)?item.targetType:'all',targetValue:String(item.targetValue||'').trim().slice(0,140),category:String(item.category||'その他').trim().slice(0,50) };
    if (!value.title || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error('タイトルと日付を入力してください。');
    if ((value.startDate&&!/^\d{4}-\d{2}-\d{2}$/.test(value.startDate))||(value.endDate&&!/^\d{4}-\d{2}-\d{2}$/.test(value.endDate))||(value.startDate&&value.endDate&&value.endDate<value.startDate)) throw new Error('公開期間を確認してください。');
    if (documents) {
      const storagePath = String(item.storagePath || '');
      const legacyUrl = String(item.url || '');
      if (!/^parentDocuments\/[A-Za-z0-9-]+\.pdf$/.test(storagePath) && !/^https:\/\//.test(legacyUrl)) throw new Error('PDFファイルを選択してください。');
      if (storagePath) { value.storagePath = storagePath; value.fileName = String(item.fileName || '資料.pdf').slice(0,120); }
      else value.url = legacyUrl.slice(0,1000);
    }
    return value;
  });
}
const collections={announcements:'parentAnnouncements',documents:'parentDocuments'};
export async function GET(request) { try { await requireAdmin(request); const [legacy,announcements,documents,templates]=await Promise.all([adminDb.collection('admin_data').doc('parentPortal').get(),adminDb.collection(collections.announcements).get(),adminDb.collection(collections.documents).get(),adminDb.collection('parentAnnouncementTemplates').get()]);const old=legacy.data()||{},merge=(before,snapshot)=>{const map=new Map((before||[]).map(item=>[item.id,item]));snapshot.docs.forEach(doc=>map.set(doc.id,{id:doc.id,...doc.data()}));return [...map.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))};return Response.json({announcements:merge(old.announcements,announcements),documents:merge(old.documents,documents),templates:templates.docs.map(doc=>({id:doc.id,...doc.data()}))}); } catch(error) { return Response.json({error:error.message},{status:error.status||400}); } }
export async function POST(request) { try { const admin = await requireAdmin(request), body = await request.json(); const ref=adminDb.collection('admin_data').doc('parentPortal');
if(body.action==='save'){const kind=body.kind;if(!collections[kind])throw new Error('保存種類が正しくありません。');const value=validate([body.item],kind==='documents')[0],ref=adminDb.collection(collections[kind]).doc(value.id),old=await ref.get(),now=FieldValue.serverTimestamp();await ref.set({...value,createdAt:old.data()?.createdAt||now,createdBy:old.data()?.createdBy||admin.uid,updatedAt:now,updatedBy:admin.uid});return Response.json({saved:true,item:value});}
if(body.action==='delete'){const kind=body.kind;if(!collections[kind]||!/^[A-Za-z0-9_-]{1,128}$/.test(body.id||''))throw new Error('削除対象が正しくありません。');const target=adminDb.collection(collections[kind]).doc(body.id),legacyRef=adminDb.collection('admin_data').doc('parentPortal'),[old,legacy]=await Promise.all([target.get(),legacyRef.get()]),legacyItem=(legacy.data()?.[kind]||[]).find(item=>String(item.id)===String(body.id));const batch=adminDb.batch();batch.delete(target);if(legacyItem)batch.set(legacyRef,{[kind]:(legacy.data()?.[kind]||[]).filter(item=>String(item.id)!==String(body.id)),updatedAt:new Date().toISOString()},{merge:true});await batch.commit();const storagePath=old.data()?.storagePath||legacyItem?.storagePath;if(kind==='documents'&&storagePath)try{await adminStorage.bucket().file(storagePath).delete({ignoreNotFound:true})}catch{}return Response.json({deleted:true});}
if(body.action==='saveTemplate'){const title=String(body.title||'').trim().slice(0,120),text=String(body.body||'').trim().slice(0,1000);if(!title||!text)throw new Error('テンプレート名と本文を入力してください。');const id=/^[A-Za-z0-9_-]{1,128}$/.test(body.id||'')?body.id:crypto.randomUUID();await adminDb.collection('parentAnnouncementTemplates').doc(id).set({title,body:text,updatedBy:admin.uid,updatedAt:FieldValue.serverTimestamp()},{merge:true});return Response.json({saved:true,id});}
const data = { announcements:validate(body.announcements), documents:validate(body.documents,true), updatedBy:admin.uid, updatedAt:FieldValue.serverTimestamp() };
const result=await adminDb.runTransaction(async tx=>{const old=await tx.get(ref),version=Number(old.data()?.version||0);if(Number(body.version||0)!==version)throw new Error('別の画面で公開情報が更新されました。内容を控えて再読み込みしてください。');tx.set(ref,{...data,version:version+1});return {version:version+1,oldPaths:(old.data()?.documents||[]).map(item=>item.storagePath).filter(Boolean)};});
let cleanupWarning=false;
try{const current=await ref.get(),keep=new Set((current.data()?.documents||[]).map(item=>item.storagePath));const [files]=await adminStorage.bucket().getFiles({prefix:'parentDocuments/'});for(const file of files){if(keep.has(file.name))continue;const old=result.oldPaths.includes(file.name);const age=Date.now()-Date.parse(file.metadata?.timeCreated||'');if(old||age>86400000)await file.delete({ignoreNotFound:true});}}catch{cleanupWarning=true;}
return Response.json({saved:true,version:result.version,cleanupWarning}); } catch(error) { return Response.json({error:error.message},{status:error.status||400}); } }
