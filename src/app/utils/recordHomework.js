// lib/recordHomework.js
import { db } from '../../firebaseConfig'
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore'
import { updateExperience } from './updateExperience'

/**
 * 宿題提出記録＋経験値反映処理
 * @param {string} userId - 生徒UID
 * @param {string} checkedBy - 管理者UID
 * @param {number} exp - 加算経験値（デフォルト15）
 * @param {number} points - 加算ポイント（デフォルト5）
 */
export async function recordHomework(userId, checkedBy, exp = 15, points = 5) {
  try {
    // 🔹 宿題履歴を Firestore に追加
    const ref = doc(collection(db, 'users', userId, 'homework'))
    await setDoc(ref, {
      submittedAt: serverTimestamp(),
      checkedBy,
      expGiven: exp,
      pointsGiven: points,
    })

    // 🔹 経験値とポイントを加算（称号判定も自動で行われる）
    await updateExperience(userId, exp, 'homework_submit', points)

    console.log(`📘 宿題提出を登録しました: ${userId}`)
  } catch (error) {
    console.error('❌ 宿題登録エラー:', error)
    throw error
  }
}
