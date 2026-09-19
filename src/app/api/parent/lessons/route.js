import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent, linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { readPublicHomeworkCompatible } from '@/lib/homeworkServer';
import { mergeParentLessons } from '@/lib/parentLessonCompatibility.mjs';

// Public homework remains the canonical parent source: collection('homeworkPublic').

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 20;

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
    const settings=await readAcademicSettings();
    const periods=settings.flatMap(item=>[1,2,3].map(term=>({id:`${item.year}_${term}`,...(item.terms?.[term]||{})})))
      .filter(item=>item.start&&item.end&&(!after||item.start<after)).sort((a,b)=>b.start.localeCompare(a.start));
    const entries=[];
    const grade=Number(student.data().grade);
    // Document-name descending queries are not available in the deployed database.
    // Read one bounded term in ascending order and merge the sources before pagination.
    for(const period of periods){
      const read=collection=>{let query=collection.where(FieldPath.documentId(),'>=',period.start).where(FieldPath.documentId(),'<=',period.end);if(after)query=query.where(FieldPath.documentId(),'<',after);return query.get()};
      const sources=[['public',publicRef],['common',commonRef]];
      if(!elementary&&grade>=7&&grade<=9)sources.push(['legacy',adminDb.collection('users').doc(id).collection('lessonTerms').doc(period.id).collection('records')]);
      const snapshots=await Promise.all(sources.map(([,collection])=>read(collection)));
      snapshots.forEach((snapshot,index)=>snapshot.docs.forEach(doc=>entries.push({id:doc.id,data:doc.data(),source:sources[index][0]})));
      if(mergeParentLessons(entries).size>PAGE_SIZE)break;
    }
    const homework=await readPublicHomeworkCompatible(studentKey,500,after);
    const ordered=[...mergeParentLessons(entries).values()].sort((a,b)=>b.date.localeCompare(a.date));
    const page = ordered.slice(0, PAGE_SIZE);
    const lessons = page.map(data => ({ ...data,
      assignedHomework: homework.filter(item => item.assignedDate === data.date),
      reviewedHomework: homework.filter(item => item.review?.date === data.date || item.laterCompletion?.date === data.date),
    }));
    return Response.json({ lessons, homework, next: ordered.length > PAGE_SIZE ? page.at(-1).date : null });
  } catch (error) { return Response.json({ error: error.message || '授業記録を取得できませんでした。' }, { status: error.status || 400 }); }
}
