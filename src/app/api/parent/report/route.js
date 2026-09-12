import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent, linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { japanDateId, resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import { buildParentTermSummary, publicScore } from '@/lib/parentReport.mjs';
import { publicAssignment } from '@/lib/homeworkModel.mjs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const parent = await requireParent(request), params = new URL(request.url).searchParams;
    const studentKey = normalizeStudentKey(params.get('student')), termId = params.get('term');
    if (!(await linkedChildren(parent.uid)).includes(studentKey)) return Response.json({ error: 'この生徒の情報を閲覧する権限がありません。' }, { status: 403 });
    const settings = await readAcademicSettings();
    const terms = settings.flatMap(item => [1,2,3].map(term => ({ id: `${item.year}_${term}`, year: item.year, term, ...(item.terms?.[term] || item.terms?.[String(term)] || {}) }))).filter(item => item.start && item.end).sort((a,b) => b.start.localeCompare(a.start));
    let currentTermId = null; try { currentTermId = resolveAcademicTerm(settings, japanDateId()).id; } catch {}
    if (!termId) return Response.json({ terms, currentTermId });
    const selected = terms.find(item => item.id === termId); if (!selected) throw new Error('学期設定が見つかりません。');
    const elementary = studentKey.startsWith('elementary_'), id = studentKey.replace(/^(user|elementary)_/, '');
    const publicLessons = await adminDb.collection('lessonPublic').doc(studentKey).collection('records').where(FieldPath.documentId(), '>=', selected.start).where(FieldPath.documentId(), '<=', selected.end).limit(300).get();
    const student = await adminDb.collection(elementary ? 'adminStudents' : 'users').doc(id).get();
    if (!student.exists || student.data().active === false || student.data().enrollmentStatus === 'withdrawn') throw new Error('対象生徒を確認できません。');
    let legacyLessons;
    if (!elementary && Number(student.data().grade) >= 7 && Number(student.data().grade) <= 9) legacyLessons = await adminDb.collection('users').doc(id).collection('lessonTerms').doc(termId).collection('records').limit(300).get();
    else legacyLessons = await adminDb.collection('adminLessonAttendance').doc(studentKey).collection('records').where(FieldPath.documentId(), '>=', selected.start).where(FieldPath.documentId(), '<=', selected.end).limit(300).get();
    const byDate = new Map(legacyLessons.docs.map(doc => { const data = doc.data(); const learning = data.learningRecord || data; return [doc.id, { date: doc.id, attendance: data.status || data.attendance, late: learning.late === true, forgot: learning.forgot === true, wordTest: learning.wordTest || null }]; }));
    publicLessons.docs.forEach(doc => byDate.set(doc.id, { ...(byDate.get(doc.id) || {}), ...doc.data(), date: doc.id }));
    const homework = await adminDb.collection('homeworkPublic').doc(studentKey).collection('items').orderBy('assignedDate', 'desc').limit(300).get();
    const assignments = homework.docs.map(doc => ({ id: doc.id, ...publicAssignment(doc.data()) })).filter(item => item.review?.date >= selected.start && item.review?.date <= selected.end);
    let scores = [];
    if (!elementary) { const snapshot = await adminDb.collection('users').doc(id).collection('scores').get(); scores = snapshot.docs.map(doc => publicScore(doc.data(), doc.id)).filter(item => item && item.year === String(selected.year) && item.term === `${selected.term}学期`); }
    return Response.json({ terms, currentTermId, selected, summary: buildParentTermSummary([...byDate.values()], assignments), scores });
  } catch (error) { return Response.json({ error: error.message || '学期レポートを取得できませんでした。' }, { status: error.status || 400 }); }
}
