import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent, linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { readPublicHomeworkCompatible } from '@/lib/homeworkServer';

// Public homework remains the canonical parent source: collection('homeworkPublic').

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 20;

function pageQuery(collection, after, size = PAGE_SIZE + 1) {
  let query = collection.orderBy(FieldPath.documentId(), 'desc');
  if (after) query = query.where(FieldPath.documentId(), '<', after);
  return query.limit(size);
}

function safeRecord(doc, source) {
  const data = doc.data(), learning = data.learningRecord || data;
  if (source === 'public') return { date: data.date || doc.id, termId: data.termId || null, attendance: data.attendance || null, late: data.late === true, forgot: data.forgot === true, wordTest: data.wordTest || null, comments: data.comments || [], homeworkResult: data.homeworkResult || null };
  return { date: doc.id, termId: data.termId || learning.termId || null, attendance: data.status || data.attendance || null, late: learning.late === true, forgot: learning.forgot === true, wordTest: learning.wordTest || null, comments: [], homeworkResult: null };
}

export async function GET(request) {
  try {
    const parent = await requireParent(request), params = new URL(request.url).searchParams;
    const studentKey = normalizeStudentKey(params.get('student')), after = params.get('after');
    if (after && !/^\d{4}-\d{2}-\d{2}$/.test(after)) throw new Error('続きを取得する位置が正しくありません。');
    if (!(await linkedChildren(parent.uid, parent.role === 'admin')).includes(studentKey)) return Response.json({ error: 'この生徒の情報を閲覧する権限がありません。' }, { status: 403 });
    const elementary = studentKey.startsWith('elementary_'), id = studentKey.replace(/^(user|elementary)_/, '');
    const student = await adminDb.collection(elementary ? 'adminStudents' : 'users').doc(id).get();
    if (!student.exists || student.data().active === false || student.data().enrollmentStatus === 'withdrawn' || Number(student.data().grade)>9) throw new Error('対象生徒を確認できません。');
    const publicRef = adminDb.collection('lessonPublic').doc(studentKey).collection('records');
    const commonRef = adminDb.collection('adminLessonAttendance').doc(studentKey).collection('records');
    const [publicSnap, commonSnap, homework] = await Promise.all([
      pageQuery(publicRef, after).get(), pageQuery(commonRef, after).get(),
      after ? Promise.resolve([]) : readPublicHomeworkCompatible(studentKey, 150),
    ]);
    const byDate = new Map(commonSnap.docs.map(doc => [doc.id, safeRecord(doc, 'legacy')]));
    publicSnap.docs.forEach(doc => byDate.set(doc.id, { ...(byDate.get(doc.id) || {}), ...safeRecord(doc, 'public') }));

    // 統合前の中学生記録は lessonTerms にしかないため、不足するページだけ補完する。
    const grade = Number(student.data().grade);
    if (!elementary && grade >= 7 && grade <= 9 && byDate.size <= PAGE_SIZE) {
      const settings = await readAcademicSettings();
      const candidates = settings.flatMap(item => [1,2,3].map(term => ({ id:`${item.year}_${term}`, ...(item.terms?.[term] || item.terms?.[String(term)] || {}) }))).filter(item => item.start && item.end && (!after || item.start < after)).sort((a,b) => b.start.localeCompare(a.start)).slice(0, 6);
      const legacy = await Promise.all(candidates.map(item => pageQuery(adminDb.collection('users').doc(id).collection('lessonTerms').doc(item.id).collection('records'), after).get()));
      legacy.flatMap(snapshot => snapshot.docs).forEach(doc => { if (!byDate.has(doc.id)) byDate.set(doc.id, safeRecord(doc, 'legacy')); });
    }

    const ordered = [...byDate.values()].filter(item => !after || item.date < after).sort((a,b) => b.date.localeCompare(a.date));
    const page = ordered.slice(0, PAGE_SIZE);
    const lessons = page.map(data => ({ ...data,
      assignedHomework: homework.filter(item => item.assignedDate === data.date),
      reviewedHomework: homework.filter(item => item.review?.date === data.date || item.laterCompletion?.date === data.date),
    }));
    return Response.json({ lessons, homework, next: ordered.length > PAGE_SIZE ? page.at(-1).date : null });
  } catch (error) { return Response.json({ error: error.message || '授業記録を取得できませんでした。' }, { status: error.status || 400 }); }
}
