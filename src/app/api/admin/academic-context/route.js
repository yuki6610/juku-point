import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { japanDateId, resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const token = request.headers.get('authorization') || '';
    if (!token.startsWith('Bearer ')) return Response.json({ error: 'ログインしてください。' }, { status: 401 });
    const user = await adminAuth.verifyIdToken(token.slice(7));
    if (!(await adminDb.collection('admins').doc(user.uid).get()).exists) return Response.json({ error: '管理者権限がありません。' }, { status: 403 });
    const settings = await readAcademicSettings();
    const date = japanDateId();
    let current = null;
    let error = '';
    try { current = resolveAcademicTerm(settings, date); } catch (problem) { error = problem.message; }
    return Response.json({ current, settings, date, error }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('学期設定取得エラー', error);
    return Response.json({ error: '年度・学期の共通設定を取得できませんでした。再読み込みしてください。' }, { status: 500 });
  }
}
