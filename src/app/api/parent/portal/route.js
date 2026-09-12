import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent } from '@/lib/parentAccess';

export const dynamic = 'force-dynamic';
const cleanItems = (items, pdf = false) => (Array.isArray(items) ? items : []).slice(0, 100).map((item, index) => ({
  id: String(item.id || index), title: String(item.title || '').slice(0, 120),
  body: String(item.body || '').slice(0, 1000), date: String(item.date || '').slice(0, 10),
  ...(pdf && /^https:\/\//.test(item.url || '') ? { url: item.url } : {}),
})).filter(item => item.title);

export async function GET(request) {
  try {
    await requireParent(request);
    const requested = Number(new URL(request.url).searchParams.get('year'));
    const now = new Date(), defaultYear = now.getMonth() + 1 <= 3 ? now.getFullYear() - 1 : now.getFullYear();
    const year = Number.isInteger(requested) && requested >= 2020 && requested <= 2100 ? requested : defaultYear;
    const [content, calendar] = await Promise.all([
      adminDb.collection('admin_data').doc('parentPortal').get(),
      adminDb.collection('adminLessonCalendars').doc(String(year)).get(),
    ]);
    const data = content.data() || {}, dates = calendar.data()?.dates || {};
    return Response.json({ year, announcements: cleanItems(data.announcements), documents: cleanItems(data.documents, true), teachingDates: Object.keys(dates).filter(date => dates[date]).sort() });
  } catch (error) { return Response.json({ error: error.message || '保護者向け情報を取得できませんでした。' }, { status: error.status || 400 }); }
}
