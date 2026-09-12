import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent, linkedChildren } from '@/lib/parentAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { japanDateId, resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const parent = await requireParent(request); const keys = await linkedChildren(parent.uid, parent.role === 'admin');
    const children = (await Promise.all(keys.map(async key => { const elementary = key.startsWith('elementary_'); const id = key.replace(/^(user|elementary)_/, ''); const doc = await adminDb.collection(elementary ? 'adminStudents' : 'users').doc(id).get(); if (!doc.exists || doc.data().active === false || doc.data().enrollmentStatus === 'withdrawn' || Number(doc.data().grade)>9) return null; const data = doc.data(); return { key, name: data.realName || data.name || data.displayName || '名前未設定', grade: Number(data.grade || 0) }; }))).filter(Boolean);
    let currentTermId=null, submissionStatus={};
    try { currentTermId=resolveAcademicTerm(await readAcademicSettings(),japanDateId()).id; const snapshot=await adminDb.collection('scoreSubmissionTerms').doc(currentTermId).collection('students').get(); submissionStatus=Object.fromEntries(snapshot.docs.map(doc=>[doc.id,{examReceived:doc.data().examReceived===true,internalReceived:doc.data().internalReceived===true}])); } catch {}
    return Response.json({ parent: { displayName: parent.profile.displayName }, adminPreview: parent.role === 'admin', children, currentTermId, submissionStatus });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
}
