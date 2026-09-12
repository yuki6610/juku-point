import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { resolveAcademicTerm } from '@/lib/academicCalendar.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const staff = await requireStaff(request);
    const date = new URL(request.url).searchParams.get('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('日付が正しくありません。');
    const [users, elementary] = await Promise.all([adminDb.collection('users').get(), adminDb.collection('adminStudents').get()]);
    const students = [...users.docs.map(doc => ({ key: `user_${doc.id}`, id: doc.id, source: 'user', ...doc.data() })), ...elementary.docs.map(doc => ({ key: `elementary_${doc.id}`, id: doc.id, source: 'elementary', ...doc.data() }))]
      .filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn')
      .map(data => ({ key: data.key, id: data.id, source: data.source, name: data.realName || data.displayName || '名前未設定', grade: Number(data.grade), wordTestQuestionCount: Number(data.wordTestQuestionCount || (data.grade === 7 ? 20 : data.grade === 8 ? 30 : data.grade === 9 ? 50 : 20)) }))
      .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, 'ja'));
    const settings = await readAcademicSettings();
    const term = resolveAcademicTerm(settings, date);
    return Response.json({ role: staff.role, displayName: staff.profile?.displayName || '管理者', date, term, students });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
