import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { requireHomeworkStaff, homeworkTemplates, homeworkRefs } from '@/lib/homeworkServer';
import { assertAssigned } from '@/lib/staffAccess';
import { validateAssignment, validateTemplates, publicAssignment } from '@/lib/homeworkModel.mjs';
import { getAcademicTerm } from '@/lib/academicCalendarServer';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const staff = await requireHomeworkStaff(request);
    const params = new URL(request.url).searchParams;
    const key = params.get('student');
    if (key) assertAssigned(staff, key, params.get('date') || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()));
    const templates = await homeworkTemplates();
    if (!key) return Response.json({ templates });
    if(params.get('assignment')) {
      const selected=await homeworkRefs(key,params.get('assignment')).privateRef.get();
      return Response.json({templates,items:selected.exists?[{id:selected.id,...publicAssignment(selected.data()),version:selected.data().version||1}]:[],next:null});
    }
    const collection = homeworkRefs(key, 'check').privateRef.parent;
    let query = collection.orderBy('assignedDate', 'desc').limit(31);
    const after = params.get('after');
    if (after) { const cursor = await homeworkRefs(key, after).privateRef.get(); if (!cursor.exists) throw new Error('続きを取得できません。'); query = query.startAfter(cursor); }
    const snapshot = await query.get();
    return Response.json({ templates, items: snapshot.docs.slice(0, 30).map(doc => ({ id: doc.id, ...publicAssignment(doc.data()), version: doc.data().version || 1 })), next: snapshot.docs.length > 30 ? snapshot.docs[29].id : null });
  } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
}
export async function POST(request) {
  try {
    const staff = await requireHomeworkStaff(request);
    const uid = staff.uid;
    const body = await request.json();
    if (body.action === 'templates') {
      if (staff.role !== 'admin') throw new Error('教材・定型文の変更は管理者のみ行えます。');
      const templates = validateTemplates(body.templates);
      await adminDb.collection('admin_data').doc('homeworkTemplates').set({ templates, updatedBy: uid, updatedAt: FieldValue.serverTimestamp() });
      return Response.json({ saved: true });
    }
    if (body.action === 'materials' || body.action === 'texts') {
      if (staff.role !== 'admin') throw new Error('教材・定型文の変更は管理者のみ行えます。');
      const current = await homeworkTemplates();
      const candidate = body.action === 'materials'
        ? { ...current, materials: body.materials }
        : { ...current, comments: body.comments, results: body.results };
      const templates = validateTemplates(candidate);
      await adminDb.collection('admin_data').doc('homeworkTemplates').set({ templates, updatedBy: uid, updatedAt: FieldValue.serverTimestamp() });
      return Response.json({ saved: true, templates });
    }
    const templates = await homeworkTemplates();
    const assignment = validateAssignment(body, templates);
    const term = await getAcademicTerm(assignment.assignedDate);
    const key = body.student;
    assertAssigned(staff, key, assignment.assignedDate);
    const refs = homeworkRefs(key, body.id);
    const sameDay = await refs.privateRef.parent.where('assignedDate','==',assignment.assignedDate).limit(20).get();
    const itemSignature=items=>JSON.stringify(items.map(item=>[item.subject,item.materialId,item.customLabel||'',item.range,Number(item.difficulty||3)]));
    const signature = itemSignature(assignment.items);
    const duplicate = sameDay.docs.find(doc=>doc.id!==body.id&&itemSignature(doc.data().items||[])===signature);
    if (duplicate) throw new Error('同じ教材・範囲の宿題がこの日に登録済みです。重複登録を確認してください。');
    const source = key.startsWith('elementary_') ? 'adminStudents' : 'users';
    const id = key.slice(key.indexOf('_') + 1);
    await adminDb.runTransaction(async transaction => {
      const [old, student] = await Promise.all([transaction.get(refs.privateRef), transaction.get(adminDb.collection(source).doc(id))]);
      if (!student.exists || student.data().active === false || student.data().enrollmentStatus === 'withdrawn') throw new Error('対象生徒が見つからないか退塾済みです。');
      if (Number(student.data().grade)>9) throw new Error('高校生は出席管理のみ利用できます。');
      // A retry after a lost response must not create another assignment or erase its review.
      if(old.exists&&old.data().updatedBy===uid&&old.data().assignedDate===assignment.assignedDate&&old.data().dueDate===assignment.dueDate&&itemSignature(old.data().items||[])===signature)return;
      if (old.exists && body.version !== (old.data().version || 1)) throw new Error('他の操作で更新されました。再読み込みしてください。');
      if (old.exists && old.data().review && !['pending', 'absent'].includes(old.data().review.status)) throw new Error('確認済みの宿題内容は変更できません。新しいセットとして登録してください。');
      const data = { ...assignment, studentKey: key, termId: term.id, review: old.data()?.review || null, laterCompletion: null, version: (old.data()?.version || 0) + 1, createdBy: old.data()?.createdBy || uid, createdAt: old.data()?.createdAt || FieldValue.serverTimestamp(), updatedBy: uid, updatedAt: FieldValue.serverTimestamp() };
      transaction.set(refs.privateRef, data, { merge: true });
      transaction.set(refs.publicRef, publicAssignment(data));
    });
    return Response.json({ saved: true });
  } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
}
