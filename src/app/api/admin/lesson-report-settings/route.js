import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
import { DEFAULT_REPORT_RATING_TEXTS, normalizeReportRatingTexts } from '@/lib/lessonReportAi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireAdmin(request);
    const snapshot=await adminDb.collection('admin_data').doc('lessonReportSettings').get();
    return Response.json({ ratingTexts:normalizeReportRatingTexts(snapshot.data()?.ratingTexts || DEFAULT_REPORT_RATING_TEXTS) });
  } catch (error) {
    return Response.json({ error:error.message || '評価文章を取得できませんでした。' }, { status:error.status || 400 });
  }
}

export async function POST(request) {
  try {
    const admin=await requireAdmin(request);
    const body=await request.json();
    const ratingTexts=normalizeReportRatingTexts(body.ratingTexts);
    await adminDb.collection('admin_data').doc('lessonReportSettings').set({ ratingTexts, updatedBy:admin.uid, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
    return Response.json({ saved:true, ratingTexts });
  } catch (error) {
    return Response.json({ error:error.message || '評価文章を保存できませんでした。' }, { status:error.status || 400 });
  }
}
