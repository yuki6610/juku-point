import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
import { SCORE_TEST_TYPES } from '@/lib/scoreSubmissionPlan.mjs';
import { getAcademicTerm } from '@/lib/academicCalendarServer';

export const dynamic = 'force-dynamic';
const validYear = value => /^20\d{2}$/.test(String(value || ''));
const validTerm = value => /^20\d{2}_[123]$/.test(String(value || ''));
const calendarRef = year => adminDb.collection('scoreSubmissionCalendars').doc(String(year)).collection('entries');

export async function GET(request) {
  try {
    await requireAdmin(request);
    const year = new URL(request.url).searchParams.get('year');
    if (!validYear(year)) throw new Error('年度を確認してください。');
    const [entries, profiles] = await Promise.all([calendarRef(year).get(), adminDb.collection('studentProfiles').get()]);
    const schools = [...new Set(profiles.docs.map(doc => String(doc.data().schoolName || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    return Response.json({ entries: entries.docs.map(doc => ({ id: doc.id, ...doc.data(), updatedAt: null })).filter(item => item.active !== false), schools });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json();
    const year = String(body.year || ''), termId = String(body.termId || '');
    if (!validYear(year) || !validTerm(termId) || !termId.startsWith(`${year}_`)) throw new Error('年度・学期を確認してください。');
    const id = body.id ? String(body.id) : calendarRef(year).doc().id;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('予定IDが正しくありません。');
    const ref = calendarRef(year).doc(id);
    if (body.action === 'disable') {
      await ref.set({ active: false, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return Response.json({ saved: true, id });
    }
    const grade = Number(body.grade), kind = String(body.kind || ''), testType = kind === 'exam' ? String(body.testType || '') : '';
    const date = String(body.date || ''), schoolName = String(body.schoolName || '').trim().slice(0, 120);
    if (![7, 8, 9].includes(grade) || !['exam', 'internal'].includes(kind) || kind === 'exam' && !SCORE_TEST_TYPES.includes(testType)
      || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || ![year,String(Number(year)+1)].includes(date.slice(0,4))) throw new Error('学校・学年・資料・日付を確認してください。');
    if ((await getAcademicTerm(date)).id !== termId) throw new Error('提出予定日と選択した学期が一致しません。');
    const existing = await ref.get();
    const entry = { termId, schoolName, grade, kind, testType, date, active: true,
      createdBy: existing.data()?.createdBy || admin.uid, createdAt: existing.data()?.createdAt || FieldValue.serverTimestamp(),
      updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() };
    await ref.set(entry, { merge: true });
    return Response.json({ saved: true, id });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
