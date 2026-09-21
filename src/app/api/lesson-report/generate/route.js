import { FieldPath } from 'firebase-admin/firestore';
import { assertAssigned, normalizeStudentKey, requireStaff } from '@/lib/staffAccess';
import { buildLessonReportInput, LESSON_REPORT_RATING_LABELS, normalizeLessonReportAiInput } from '@/lib/lessonReportAi.mjs';
import { normalizeReportFacts } from '@/lib/lessonReport.mjs';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

async function readSubjectHistory(studentKey, subject, lessonDate) {
  if (!studentKey || !subject) return [];
  const records = adminDb.collection('lessonPublic').doc(studentKey).collection('records');
  let query = records.where('lessonReport.facts.subject', '==', subject);
  if (validDate(lessonDate)) query = query.where(FieldPath.documentId(), '<', lessonDate);
  let snapshot;
  try {
    snapshot = await query.orderBy(FieldPath.documentId(), 'desc').limit(3).get();
  } catch (error) {
    // 複合インデックスが未準備でも生成を止めず、直近分を安全に絞り込む。
    let fallback = records;
    if (validDate(lessonDate)) fallback = fallback.where(FieldPath.documentId(), '<', lessonDate);
    snapshot = await fallback.orderBy(FieldPath.documentId(), 'desc').limit(60).get();
  }
  const history = [];
  for (const document of snapshot.docs) {
    const report = document.data()?.lessonReport;
    const facts = normalizeReportFacts(report?.facts || {});
    if (facts.subject !== subject || !String(report?.text || '').trim()) continue;
    const ratings = Object.fromEntries(Object.entries(LESSON_REPORT_RATING_LABELS).map(([key, label]) => [label, facts[key]]));
    history.push({ date: document.id, report: String(report.text).trim().slice(0, 2000), ratings });
    if (history.length === 3) break;
  }
  return history;
}

export async function POST(request) {
  try {
    const staff = await requireStaff(request);
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: '授業報告生成のAPIキーが設定されていません。' }, { status: 503 });
    }

    const body = await request.json();
    const studentKey = normalizeStudentKey(body.studentKey);
    assertAssigned(staff, studentKey, body.lessonDate);
    const data = normalizeLessonReportAiInput(body);
    if (!data.learningContent) {
      return Response.json({ error: '学習内容を入力してから生成してください。' }, { status: 400 });
    }
    if (!data.subject) {
      return Response.json({ error: '教科を選択してから生成してください。' }, { status: 400 });
    }
    data.history = await readSubjectHistory(studentKey, data.subject, body.lessonDate);

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
