import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const dynamic = 'force-dynamic';
function validate(items, documents = false) {
  if (!Array.isArray(items) || items.length > 100) throw new Error('登録件数が多すぎます。');
  return items.map(item => {
    const value = { id: String(item.id || crypto.randomUUID()), title: String(item.title || '').trim().slice(0,120), body: String(item.body || '').trim().slice(0,1000), date: String(item.date || '').slice(0,10) };
    if (!value.title || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error('タイトルと日付を入力してください。');
    if (documents) { if (!/^https:\/\//.test(item.url || '')) throw new Error('PDFはhttpsで始まるURLを入力してください。'); value.url = item.url.slice(0,1000); }
    return value;
  });
}
export async function GET(request) { try { await requireAdmin(request); const doc = await adminDb.collection('admin_data').doc('parentPortal').get(); return Response.json(doc.data() || { announcements:[], documents:[] }); } catch(error) { return Response.json({error:error.message},{status:error.status||400}); } }
export async function POST(request) { try { const admin = await requireAdmin(request), body = await request.json(); const data = { announcements:validate(body.announcements), documents:validate(body.documents,true), updatedBy:admin.uid, updatedAt:FieldValue.serverTimestamp() }; await adminDb.collection('admin_data').doc('parentPortal').set(data); return Response.json({saved:true}); } catch(error) { return Response.json({error:error.message},{status:error.status||400}); } }
