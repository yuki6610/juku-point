import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_HOMEWORK_TEMPLATES, aggregateItemResults, homeworkValue, publicAssignment } from './homeworkModel.mjs';
import { requireStaff } from './staffAccess';
import { generateLessonReport } from './lessonReport.mjs';
export async function requireHomeworkUser(request, admin = false) {
  const token = request.headers.get('authorization') || '';
  if (!token.startsWith('Bearer ')) throw new Error('ログインしてください。');
  const user = await adminAuth.verifyIdToken(token.slice(7));
  if (admin && !(await adminDb.collection('admins').doc(user.uid).get()).exists) throw new Error('管理者権限がありません。');
  return user.uid;
}
export async function requireHomeworkStaff(request) { return requireStaff(request); }
export async function homeworkTemplates() {
  const snapshot = await adminDb.collection('admin_data').doc('homeworkTemplates').get();
  if (!snapshot.exists) return DEFAULT_HOMEWORK_TEMPLATES;
  const templates = snapshot.data().templates;
  return { ...templates, materials: (templates.materials || []).map(item => ({ ...item, subject: item.subject || DEFAULT_HOMEWORK_TEMPLATES.materials.find(value => value.id === item.id)?.subject || 'all' })) };
}
export function homeworkRefs(key, id) {
  if (!/^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(key) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('生徒または課題IDが正しくありません。');
  return { privateRef: adminDb.collection('homeworkAssignments').doc(key).collection('items').doc(id), publicRef: adminDb.collection('homeworkPublic').doc(key).collection('items').doc(id) };
}
// Read the public copy first and safely fill gaps left by records created before
// homeworkPublic was introduced. Only publicAssignment's allow-listed fields leave here.
export async function readPublicHomeworkCompatible(key, limit = 150, before = null) {
  const refs = homeworkRefs(key, 'check');
  const query=collection=>{let result=collection.orderBy('assignedDate','desc');if(before)result=result.where('assignedDate','<',before);return result.limit(limit)};
  const [published, legacy] = await Promise.all([
    query(refs.publicRef.parent).get(),
    query(refs.privateRef.parent).get(),
  ]);
  const byId = new Map(legacy.docs.map(doc => [doc.id, { id: doc.id, ...publicAssignment(doc.data()) }]));
  published.docs.forEach(doc => {
    const current = publicAssignment(doc.data()), old = byId.get(doc.id);
    // 初期の公開コピーには、後から入力した提出結果が反映されていない場合がある。
    // 現在の保存内容を安全な公開項目に限定して優先し、古い公開コピーの残存を防ぐ。
    byId.set(doc.id, { id: doc.id, ...current, ...old, review: old?.review || current.review || null, laterCompletion: old?.laterCompletion || current.laterCompletion || null });
  });
  return [...byId.values()].sort((a, b) => (b.assignedDate || '').localeCompare(a.assignedDate || ''));
}
// All reads happen before the caller starts writing its lesson transaction.
export async function prepareHomeworkReview(transaction, { key, date, termId, uid, review, comments, attendance, learningRecord = {}, templates }) {
  const now = FieldValue.serverTimestamp();
  const lessonRef = adminDb.collection('lessonPublic').doc(key).collection('records').doc(date);
  const oldLesson = await transaction.get(lessonRef);
  const previousComments = oldLesson.data()?.comments || [];
  const selectedComments = (comments || []).map(id => {
    const previous = previousComments.find(item => item.id === id);
    if (previous) return { id: previous.id, text: previous.text };
    const item = templates.comments.find(item => item.id === id);
    if (!item) throw new Error('コメントの選択肢が更新されています。再読み込みしてください。');
    return { id: item.id, text: item.label };
  });
  if (selectedComments.length > 10 || new Set(comments || []).size !== selectedComments.length) throw new Error('コメントは重複なく10件以内で選択してください。');
  let payload = null;
  if (review?.assignmentId) {
    const refs = homeworkRefs(key, review.assignmentId);
    const snapshot = await transaction.get(refs.privateRef);
    if (!snapshot.exists) throw new Error('宿題セットが見つかりません。');
    const assignment = snapshot.data();
    if (date < assignment.assignedDate) throw new Error('指示日より前には確認できません。');
    const itemResults = Object.fromEntries(Object.entries(review.itemResults || {}).filter(([id, status]) => assignment.items.some(item => item.id === id) && ['submitted','partial','missed'].includes(status)));
    const derivedStatus = aggregateItemResults(assignment.items, itemResults);
    if (attendance !== 'absent' && review.itemResults && derivedStatus === 'pending') throw new Error('すべての宿題について提出状況を選択してください。');
    const status = attendance === 'absent' ? 'absent' : (review.itemResults ? derivedStatus : review.status);
    const value = homeworkValue(status);
    const old = assignment.review;
    if (status === 'laterCompleted') {
      if (!old || !['partial', 'missed'].includes(old.status) || date <= old.date) throw new Error('後日完了は未実施の確認日より後の日付で入力してください。');
    } else if (old && !['pending', 'absent'].includes(old.status) && old.date !== date) {
      throw new Error('確認済みです。訂正は元の確認日、完了追記は「後日完了」で入力してください。');
    }
    if (assignment.laterCompletion && status !== 'laterCompleted') throw new Error('後日完了済みの元判定は変更できません。管理者が履歴を確認してください。');
    const missingIds = status === 'partial' ? [...new Set(review.missingIds || [])] : [];
    if (missingIds.some(id => !assignment.items.some(item => item.id === id))) throw new Error('未実施の宿題を再選択してください。');
    const previous = status === 'laterCompleted' ? assignment.laterCompletion : assignment.review;
    const result = { status, text: previous?.status === status && previous?.date === date ? previous.text : templates.results[status], date, missingIds, itemResults };
    const next = { ...assignment, ...(status === 'laterCompleted' ? { laterCompletion: result } : { review: result }) };
    payload = { ...refs, assignment, next, value, result };
  }
  return {
    homework: payload?.value,
    commit() {
      if (payload) {
        const patch = payload.result.status === 'laterCompleted' ? { laterCompletion: payload.result } : { review: payload.result };
        transaction.set(payload.privateRef, { ...patch, version: (payload.assignment.version || 1) + 1, updatedBy: uid, updatedAt: now }, { merge: true });
        transaction.set(payload.publicRef, publicAssignment(payload.next));
        transaction.set(payload.privateRef.collection('reviewHistory').doc(), { ...payload.result, updatedBy: uid, updatedAt: now });
      }
      const wordTest = learningRecord.wordTest || {};
      const hasReportInput = Boolean(String(learningRecord.learningContent || '').trim() || Object.keys(learningRecord.reportFacts || {}).length);
      const lessonReport = hasReportInput ? generateLessonReport({ facts: learningRecord.reportFacts, learningContent: learningRecord.learningContent, homework: payload?.value || learningRecord.homework, wordTest, late: learningRecord.late, forgot: learningRecord.forgot }) : null;
      transaction.set(lessonRef, {
        date, termId, attendance,
        late: attendance === 'absent' ? false : learningRecord.late === true,
        forgot: attendance === 'absent' ? false : learningRecord.forgot === true,
        wordTest: ['completed', 'makeup'].includes(wordTest.status)
          ? { status: wordTest.status, correct: Number(wordTest.correct), total: Number(wordTest.total), ...(wordTest.range ? { range: wordTest.range } : {}) }
          : { status: wordTest.status || 'notScheduled' },
        comments: selectedComments,
        homeworkResult: payload?.result || null,
        learningContent: hasReportInput ? String(learningRecord.learningContent || '').trim().slice(0, 500) : null,
        lessonReport: hasReportInput ? lessonReport : null,
        updatedAt: now,
      }, { merge: true });
    },
  };
}
