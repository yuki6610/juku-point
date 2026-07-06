import {
    doc,
    getDoc,
    updateDoc,
    increment,
} from 'firebase/firestore'
import { db } from '../../firebaseConfig'

// ================================
//  経験値付与 + レベル計算
// ================================
export async function updateExperience(uid, gainedExp, reason = 'checkin', gainedPoints = 0) {
  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) throw new Error('ユーザーが見つかりません。')
  let data = userSnap.data()

  const oldLevel = data.level ?? 1
  let currentLevel = oldLevel
  let currentExp = Math.max(0, (data.experience ?? 0) + gainedExp)
  let levelUps = 0
  const maxLevel = 999

  const expNeeded = (level) => 100 + (level - 1) * 10

  // レベルアップ処理
  while (currentExp >= expNeeded(currentLevel) && currentLevel < maxLevel) {
    currentExp -= expNeeded(currentLevel)
    currentLevel++
    levelUps++
  }

  await updateDoc(userRef, {
    experience: currentExp,
    level: currentLevel,
    points: increment(gainedPoints),
    termPoints: increment(gainedPoints),
    totalEarnedPoints: increment(
      gainedPoints > 0 || reason.includes('undo') ? gainedPoints : 0
    ),
    lastUpdated: new Date(),
  })

  return {
    oldLevel,
    newLevel: currentLevel,
    levelUps,
    experience: currentExp,
  }
}
