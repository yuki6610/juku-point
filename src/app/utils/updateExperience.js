import {
  doc, getDoc, updateDoc, setDoc, increment,
  collection, addDoc, getDocs, serverTimestamp
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

  // 🔥 getTitle を削除したので title は更新しない
  await updateDoc(userRef, {
    experience: currentExp,
    level: currentLevel,
    points: increment(gainedPoints),
    lastUpdated: new Date(),
  })

  // レベルアップ履歴
  if (levelUps > 0) {
    await addDoc(collection(db, 'users', uid, 'level_history'), {
      oldLevel: data.level,
      newLevel: currentLevel,
      gainedExp,
      reason,
      timestamp: new Date(),
    })
  }

  // 称号付与
  await checkAndGrantTitles(uid, currentLevel)

  return { newLevel: currentLevel, levelUps }
}

// ================================
//  称号自動付与
// ================================
export async function checkAndGrantTitles(uid, newLevel = null) {
  try {
    const titlesSnap = await getDocs(collection(db, "titles"));
    const earnedSnap = await getDocs(collection(db, "users", uid, "titles"));
    const earnedIds = earnedSnap.docs.map((d) => d.id);

    const userRef = doc(db, "users", uid);
    const userData = (await getDoc(userRef)).data() || {};

    const userLevel = newLevel ?? userData.level ?? 1;

    // category → userData のフィールド名
    const fieldMap = {
      homeworkCount: "homeworkCount",
      wordTestCount: "wordTestCount",
      totalWordTestScore: "totalWordTestScore",
      selfStudyCount: "selfStudyCount",
      totalStudyMinutes: "totalStudyMinutes",
      level: "level",
      rewardsCount: "rewardsCount",
    };

    for (const docSnap of titlesSnap.docs) {
      const title = docSnap.data();
      const titleId = docSnap.id;

      if (earnedIds.includes(titleId)) continue;

      // ▼ レベル称号
      if (title.condition) {
        const match = title.condition.match(/^Lv(\d+)到達$/);
        if (match) {
          const requiredLevel = parseInt(match[1]);
          if (userLevel >= requiredLevel) {
            await setDoc(doc(db, "users", uid, "titles", titleId), {
              acquiredAt: serverTimestamp(),
              name: title.name,
              type: "level",
            });
          }
          continue;
        }
      }

      // ▼ 進捗称号
      const field = fieldMap[title.category];
      if (!field) continue;

      const currentValue = Number(userData[field] ?? 0);
      const requiredValue = Number(title.requiredValue ?? 0);

      if (currentValue >= requiredValue) {
        await setDoc(doc(db, "users", uid, "titles", titleId), {
          acquiredAt: serverTimestamp(),
          name: title.name,
          type: "progress",
          field: title.category,
        });
      }
    }
  } catch (err) {
    console.error("称号付与エラー:", err);
  }
}
