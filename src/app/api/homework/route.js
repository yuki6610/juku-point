import { adminDb } from '@/lib/firebaseAdmin';
import { requireHomeworkUser, homeworkRefs } from '@/lib/homeworkServer';
import { publicAssignment } from '@/lib/homeworkModel.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const uid = await requireHomeworkUser(request);
    // The target is always derived from the verified token, never a supplied student ID.
    const key = `user_${uid}`;
    const after = new URL(request.url).searchParams.get('after');
    let query = homeworkRefs(key, 'check').publicRef.parent.orderBy('assignedDate', 'desc').limit(31);
    if (after) { const cursor = await homeworkRefs(key, after).publicRef.get(); if (!cursor.exists) throw new Error('続きを取得できません。'); query = query.startAfter(cursor); }
    const [snapshot, lessons] = await Promise.all([query.get(), adminDb.collection('lessonPublic').doc(key).collection('records').orderBy('date', 'desc').limit(10).get()]);
    return Response.json({ items: snapshot.docs.slice(0, 30).map(doc => ({ id: doc.id, ...publicAssignment(doc.data()) })), next: snapshot.docs.length > 30 ? snapshot.docs[29].id : null, comments: lessons.docs.map(doc => ({ date: doc.data().date, comments: doc.data().comments || [] })) });
  } catch (error) { return Response.json({ error: '宿題を取得できませんでした。ログイン状態を確認して再読み込みしてください。' }, { status: 400 }); }
}
