import { requireStaff } from '@/lib/staffAccess';
import { buildLessonReportInput, normalizeLessonReportAiInput } from '@/lib/lessonReportAi.mjs';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    await requireStaff(request);
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: '授業報告生成のAPIキーが設定されていません。' }, { status: 503 });
    }

    const settings = await adminDb.collection('admin_data').doc('lessonReportSettings').get();
    const data = normalizeLessonReportAiInput(await request.json(), settings.data()?.ratingTexts);
    if (!data.learningContent) {
      return Response.json({ error: '学習内容を入力してから生成してください。' }, { status: 400 });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        input: buildLessonReportInput(data),
        reasoning: { effort: 'none' },
        max_output_tokens: 350,
        store: false,
      }),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Lesson report generation failed', response.status, result?.error?.code || 'unknown');
      const message = response.status === 401
        ? '授業報告APIの認証設定を確認してください。'
        : response.status === 429
          ? '授業報告APIの利用枠または請求設定を確認してください。'
          : response.status === 403
            ? '授業報告APIでこのモデルを利用できません。'
            : '授業報告を生成できませんでした。';
      return Response.json({ error: message }, { status: 502 });
    }
    const outputText = result.output_text || result.output
      ?.flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .filter(item => item?.type === 'output_text')
      .map(item => item.text || '')
      .join('');
    const text = String(outputText || '').trim().slice(0, 2000);
    if (!text) return Response.json({ error: '授業報告を生成できませんでした。' }, { status: 502 });
    return Response.json({ text, model: 'gpt-5.6-luna' });
  } catch (error) {
    return Response.json({ error: error.message || '授業報告を生成できませんでした。' }, { status: error.status || 400 });
  }
}
