import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireStaff, assertAssigned } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { japanDateId, resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import { homeworkTemplates, prepareHomeworkReview } from '@/lib/homeworkServer';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function wordTestReward(correct, total) {
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return 0;
  const accuracy = correct / total;
  if (accuracy < 0.7) return 0;
  const effortFactor = Math.pow(total / 30, 0.8);
  const bonus = accuracy === 1 ? 1.1 : accuracy >= 0.9 ? 1.05 : 1;
  return Math.min(166, Math.max(50, Math.round(100 * accuracy * effortFactor * bonus)));
}

function homeworkReward(status) {
  if (status === "submitted") return 50;
  if (status === "partial") return -25;
  if (status === "missed") return -50;
  return 0;
}

function applyExperience(user, delta) {
  let level = Math.max(1, Number(user.level || 1));
  let experience = Math.max(0, Number(user.experience || 0) + delta);
  let levelUps = 0;
  while (level < 999 && experience >= 100 + (level - 1) * 10) {
    experience -= 100 + (level - 1) * 10;
    level += 1;
    levelUps += 1;
  }
  return { level, experience, levelUps };
}

export async function POST(request) {
  try {
    const staff = await requireStaff(request);
    const adminUid = staff.uid;
    const body = await request.json();
    const { uid, date, termId, weekId, record } = body;
    assertAssigned(staff, `user_${uid}`, date);
    const templates = body.homeworkReview || Array.isArray(body.commentIds) ? await homeworkTemplates() : null;
    const settings = await readAcademicSettings();
    let selectedTerm;
    let currentTerm;
    try {
      selectedTerm = resolveAcademicTerm(settings, date);
      currentTerm = resolveAcademicTerm(settings, japanDateId());
    } catch (error) { throw new ApiError(error.message, 400); }
    if (selectedTerm.id !== termId) throw new ApiError('授業日と学期が一致しません。画面を再読み込みしてください。', 409);

    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid || "")) throw new ApiError("生徒IDが正しくありません。", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new ApiError("授業日が正しくありません。", 400);
    if (!/^\d{4}_[1-3]$/.test(termId || "") || !/^\d{4}-W\d{2}$/.test(weekId || "")) {
      throw new ApiError("学期または週の指定が正しくありません。", 400);
    }

    const wordStatus = record?.wordTest?.status;
    const correct = Number(record?.wordTest?.correct);
    const total = Number(record?.wordTest?.total);
    if (["completed", "makeup"].includes(wordStatus) &&
        (!Number.isFinite(correct) || !Number.isFinite(total) || correct < 0 || total <= 0 || correct > total)) {
      throw new ApiError("単語テストの点数が正しくありません。", 400);
    }

    const userRef = adminDb.collection("users").doc(uid);
    const eventTimestamp = Timestamp.fromDate(new Date(`${date}T12:00:00+09:00`));
    const recordRef = userRef.collection("lessonTerms").doc(termId).collection("records").doc(date);
    const homeworkRewardRef = userRef.collection("lessonRewards").doc(`${termId}_${date}_homework`);
    const legacyHomeworkRewardRef = userRef.collection("lessonRewards").doc(`${termId}_${weekId}_homework_submitted`);
    const homeworkMissedRef = userRef.collection("lessonRewards").doc(`${termId}_${date}_homework_missed`);
    const wordRewardRef = userRef.collection("lessonRewards").doc(`${termId}_${weekId}_wordtest`);
    const homeworkHistoryRef = userRef.collection("pointHistory").doc(`lesson_${termId}_${date}_homework`);
    const homeworkMissedHistoryRef = userRef.collection("pointHistory").doc(`lesson_${termId}_${date}_homework_missed`);
    const wordHistoryRef = userRef.collection("pointHistory").doc(`lesson_${termId}_${weekId}_wordtest`);

    const result = await adminDb.runTransaction(async (transaction) => {
      const [userSnap, oldRecordSnap, oldHomeworkSnap, legacyHomeworkSnap, oldHomeworkMissedSnap, oldWordSnap] = await Promise.all([
        transaction.get(userRef), transaction.get(recordRef),
        transaction.get(homeworkRewardRef), transaction.get(legacyHomeworkRewardRef), transaction.get(homeworkMissedRef),
        transaction.get(wordRewardRef),
      ]);
      if (!userSnap.exists) throw new ApiError("生徒が見つかりません。", 404);
      const studentData = userSnap.data();
      if (Number(studentData.grade) < 7 || Number(studentData.grade) > 9 || !Number.isInteger(Number(studentData.grade))) throw new ApiError('この報酬付き学習記録は中学生専用です。', 400);

      const oldRecord = oldRecordSnap.exists ? oldRecordSnap.data() : {};
      if (oldRecord.homeworkReview?.assignmentId && oldRecord.homeworkReview.assignmentId !== body.homeworkReview?.assignmentId) throw new ApiError('この日の確認対象の宿題セットは変更できません。元のセットを選択してください。', 409);
      let publication = null;
      if (templates) {
        try { publication = await prepareHomeworkReview(transaction, { key: `user_${uid}`, date, termId, uid: adminUid, review: body.homeworkReview, comments: body.commentIds, attendance: record.attendance, learningRecord: record, templates }); }
        catch (error) { throw new ApiError(error.message, 400); }
      }
      const now = FieldValue.serverTimestamp();
      const savedRecord = {
        ...record,
        ...(templates ? { homeworkReview: body.homeworkReview || null, commentIds: body.commentIds || [] } : {}),
        ...(publication?.homework ? { homework: publication.homework } : {}),
        date, termId, weekId,
        createdBy: oldRecord.createdBy || adminUid,
        updatedBy: adminUid,
        createdAt: oldRecord.createdAt || now,
        updatedAt: now,
      };
      transaction.set(recordRef, savedRecord, { merge: true });
      transaction.set(adminDb.collection('dailyLessonInputs').doc(date).collection('students').doc(`user_${uid}`),{ studentKey:`user_${uid}`,date,grade:Number(studentData.grade),updatedBy:adminUid,updatedAt:now },{ merge:true });
      publication?.commit();

      let pointDelta = 0;
      let expDelta = 0;
      let earnedDelta = 0;
      let homeworkCountDelta = 0;
      let wordTestCountDelta = 0;
      let wordScoreDelta = 0;
      const rewards = { homework: null, wordTest: null };

      const requestedHomework = homeworkReward(savedRecord.homework);
      const oldHomework = oldHomeworkSnap.exists ? oldHomeworkSnap.data() : (legacyHomeworkSnap.exists && legacyHomeworkSnap.data().sourceDate === date ? legacyHomeworkSnap.data() : null);
      if (!oldHomework && requestedHomework === 50) {
        pointDelta += 50;
        expDelta += 50;
        earnedDelta += 50;
        homeworkCountDelta += 1;
        rewards.homework = 50;
        transaction.set(homeworkRewardRef, {
          type: "homework", termId, weekId, sourceDate: date, amount: 50, exp: 50,
          status: "submitted", createdAt: now, updatedAt: now,
        });
        transaction.set(homeworkHistoryRef, {
          type: "homework", amount: 50, exp: 50, week: weekId, termId,
          sourceDate: date, message: "宿題提出ボーナス", createdAt: eventTimestamp, updatedAt: now,
        }, { merge: true });
      } else if (oldHomework?.sourceDate === date && requestedHomework !== 50) {
        pointDelta -= 50;
        expDelta -= 50;
        earnedDelta -= 50;
        homeworkCountDelta -= 1;
        transaction.delete(homeworkRewardRef);
        if (legacyHomeworkSnap.exists && legacyHomeworkSnap.data().sourceDate === date) transaction.delete(legacyHomeworkRewardRef);
        transaction.set(homeworkHistoryRef, {
          type: "homework_undo", amount: -50, exp: -50, week: weekId, termId,
          sourceDate: date, message: "宿題提出ボーナス取消", createdAt: eventTimestamp, updatedAt: now,
        }, { merge: true });
      }

      const oldMissed = oldHomeworkMissedSnap.exists ? Number(oldHomeworkMissedSnap.data().amount || 0) : 0;
      const nextMissed = requestedHomework < 0 ? requestedHomework : 0;
      if (oldMissed !== nextMissed) {
        pointDelta += nextMissed - oldMissed;
        expDelta += nextMissed - oldMissed;
        rewards.homework = nextMissed || rewards.homework;
        if (nextMissed) {
          transaction.set(homeworkMissedRef, {
            type: "homework_missed", termId, weekId, sourceDate: date,
            amount: nextMissed, exp: nextMissed, status: requestedHomework === -25 ? 'partial' : 'missed', createdAt: now, updatedAt: now,
          }, { merge: true });
          transaction.set(homeworkMissedHistoryRef, {
            type: requestedHomework === -25 ? "homework_partial" : "homework_missed", amount: nextMissed, exp: nextMissed, week: weekId,
            termId, sourceDate: date, message: requestedHomework === -25 ? "宿題途中" : "宿題未提出", createdAt: eventTimestamp, updatedAt: now,
          }, { merge: true });
        } else {
          transaction.delete(homeworkMissedRef);
          transaction.set(homeworkMissedHistoryRef, {
            type: "homework_undo", amount: 50, exp: 50, week: weekId,
            termId, sourceDate: date, message: "宿題未提出の取消", createdAt: eventTimestamp, updatedAt: now,
          }, { merge: true });
        }
      }

      const wordCompleted = ["completed", "makeup"].includes(wordStatus);
      const requestedWord = wordCompleted ? wordTestReward(correct, total) : 0;
      const oldWord = oldWordSnap.exists ? oldWordSnap.data() : null;
      if (oldWord && oldWord.sourceDate !== date && wordCompleted) {
        throw new ApiError("この週の単語テストはすでに別の日付で記録されています。", 409);
      }
      if ((!oldWord && wordCompleted) || oldWord?.sourceDate === date) {
        const previous = Number(oldWord?.amount || 0);
        const previousCorrect = Number(oldWord?.correct || 0);
        const wasCompleted = Boolean(oldWord?.completed);
        pointDelta += requestedWord - previous;
        expDelta += requestedWord - previous;
        earnedDelta += Math.max(requestedWord, 0) - Math.max(previous, 0);
        wordTestCountDelta += Number(wordCompleted) - Number(wasCompleted);
        wordScoreDelta += (wordCompleted ? correct : 0) - previousCorrect;
        rewards.wordTest = requestedWord;
        transaction.set(wordRewardRef, {
          type: "wordtest", termId, weekId, sourceDate: date, amount: requestedWord,
          exp: requestedWord, correct: wordCompleted ? correct : 0,
          total: wordCompleted ? total : 0, accuracy: wordCompleted ? correct / total : 0,
          completed: wordCompleted, updatedAt: now, createdAt: oldWord?.createdAt || now,
        }, { merge: true });
        transaction.set(wordHistoryRef, {
          type: wordCompleted ? "wordtest" : "wordtest_undo", amount: requestedWord,
          exp: requestedWord, correct: wordCompleted ? correct : 0,
          total: wordCompleted ? total : 0, week: weekId, termId, sourceDate: date,
          message: wordCompleted && requestedWord === 0 ? "単語テスト（正答率70%未満・ポイントなし）" : "単語テスト",
          createdAt: eventTimestamp, updatedAt: now,
        }, { merge: true });
      }

      const user = userSnap.data();
      const nextExp = applyExperience(user, expDelta);
      transaction.update(userRef, {
        points: Number(user.points || 0) + pointDelta,
        ...(selectedTerm.id === currentTerm.id ? { termPoints: Number(user.termPoints || 0) + pointDelta } : {}),
        totalEarnedPoints: Math.max(0, Number(user.totalEarnedPoints || 0) + earnedDelta),
        experience: nextExp.experience,
        level: nextExp.level,
        homeworkCount: Math.max(0, Number(user.homeworkCount || 0) + homeworkCountDelta),
        wordTestCount: Math.max(0, Number(user.wordTestCount || 0) + wordTestCountDelta),
        totalWordTestScore: Math.max(0, Number(user.totalWordTestScore || 0) + wordScoreDelta),
        ...(wordCompleted ? { wordTestQuestionCount: total } : {}),
        lastUpdated: now,
      });
      return { rewards, pointDelta, expDelta, levelUps: nextExp.levelUps };
    });

    return Response.json(result);
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("学習記録保存APIエラー:", error);
    return Response.json(
      { error: error instanceof ApiError ? error.message : "学習記録を保存できませんでした。" },
      { status: error.status || (error instanceof ApiError ? error.status : 500) }
    );
  }
}
