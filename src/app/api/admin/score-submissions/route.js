import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
import { matchingSubmissionEntries, projectSubmissionStatus } from '@/lib/scoreSubmissionPlan.mjs';

export const dynamic = 'force-dynamic';
const validTerm = value => /^20\d{2}_[123]$/.test(value || '');

export async function GET(request) {
  try {
    await requireAdmin(request);
    const termId = new URL(request.url).searchParams.get('term');
    if (!validTerm(termId)) throw new Error('学期を確認してください。');
    const [year,term] = termId.split('_');
    const [users,elementary,profiles,calendar] = await Promise.all([
      adminDb.collection('users').get(), adminDb.collection('adminStudents').get(), adminDb.collection('studentProfiles').get(),
      adminDb.collection('scoreSubmissionCalendars').doc(year).collection('entries').get(),
    ]);
    const profileMap=Object.fromEntries(profiles.docs.map(doc=>[doc.id,doc.data()]));
    const entries=calendar.docs.map(doc=>({id:doc.id,...doc.data()}));
    const students = [...users.docs.map(doc => ({ id:doc.id,source:'users',key:`user_${doc.id}`,...doc.data() })),...elementary.docs.map(doc=>({id:doc.id,source:'adminStudents',key:`elementary_${doc.id}`,...doc.data()}))].filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn' && Number(item.grade) >= 7 && Number(item.grade) <= 9);
    const rows = await Promise.all(students.map(async student => {
      const [scores,status] = await Promise.all([
        adminDb.collection(student.source).doc(student.id).collection('scores').where('year','==',year).where('term','==',`${term}学期`).get(),
        adminDb.collection('scoreSubmissionTerms').doc(termId).collection('students').doc(student.source==='users'?student.id:student.key).get(),
      ]);
      const saved = status.data() || {},calendarSchools=[...new Set(entries.map(item=>String(item.schoolName||'')).filter(Boolean))],tagSchool=(student.tags||[]).find(tag=>calendarSchools.some(name=>String(name).normalize('NFKC').replace(/\s+/g,'')===String(tag).normalize('NFKC').replace(/\s+/g,''))),schoolName=tagSchool||profileMap[student.key]?.schoolName || '';
      const requiredItems=matchingSubmissionEntries(entries,{grade:student.grade,schoolName},termId);
      const scoreRows=scores.docs.map(doc=>doc.data());
      const projected=projectSubmissionStatus(requiredItems,saved,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date()),scoreRows);
      return {
        uid:student.source==='users'?student.id:student.key, name:student.realName || student.name || student.displayName || '名前未設定', grade:Number(student.grade), schoolName,
        examReceived:projected.examReceived, internalReceived:projected.internalReceived, submissionItems:projected.items,
        hasSchedule:projected.hasSchedule, missingCount:projected.missingCount, legacyCount:projected.legacyCount,
        resubmission:saved.resubmission === true, note:String(saved.note || ''),
        updatedBy:saved.updatedBy || null, updatedAt:saved.updatedAt?.toDate?.().toISOString() || null,
        hasExamData:scoreRows.some(item => item.type === 'exam'), hasInternalData:scoreRows.some(item => item.type === 'internal'),
      };
    }));
    return Response.json({ termId,students:rows.sort((a,b) => a.grade-b.grade || a.name.localeCompare(b.name,'ja')) });
  } catch (error) { return Response.json({ error:error.message },{ status:error.status || 400 }); }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json();
    if (!validTerm(body.termId) || !/^[A-Za-z0-9_-]{1,128}$/.test(body.uid || '')) throw new Error('対象を確認してください。');
    const ref = adminDb.collection('scoreSubmissionTerms').doc(body.termId).collection('students').doc(body.uid);
    const old = await ref.get(), before = old.data() || {};
    const itemId=body.itemId===undefined?null:String(body.itemId||'');
    if(itemId&&!/^[A-Za-z0-9_-]{1,128}$/.test(itemId))throw new Error('提出項目を確認してください。');
    const next = {
      uid:body.uid, termId:body.termId, examReceived:body.examReceived === true, internalReceived:body.internalReceived === true,
      resubmission:body.resubmission === undefined ? before.resubmission === true : body.resubmission === true,
      note:body.note === undefined ? String(before.note || '') : String(body.note || '').trim().slice(0,300),
      updatedBy:admin.uid, updatedAt:FieldValue.serverTimestamp(),
    };
    if(itemId)next.itemStatuses={...(before.itemStatuses||{}),[itemId]:{received:body.received===true,updatedBy:admin.uid,updatedAt:FieldValue.serverTimestamp()}};
    const batch = adminDb.batch();
    batch.set(ref,next,{ merge:true });
    batch.set(ref.collection('history').doc(),{
      before:{ examReceived:before.examReceived === true,internalReceived:before.internalReceived === true,resubmission:before.resubmission === true,note:String(before.note || '') },
      after:{ examReceived:next.examReceived,internalReceived:next.internalReceived,resubmission:next.resubmission,note:next.note,itemId,received:itemId?body.received===true:null },
      changedBy:admin.uid,changedAt:FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return Response.json({ saved:true });
  } catch (error) { return Response.json({ error:error.message },{ status:error.status || 400 }); }
}
