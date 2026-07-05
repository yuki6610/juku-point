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
  let data = userSnap.data()

  let currentLevel = data.level ?? 1
  let currentExp = (data.experience ?? 0) + gainedExp
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
    lastUpdated: new Date(),
  })
}
