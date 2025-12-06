'use client'

import { initializeApp, getApps, getApp } from "firebase/app"
import { getFirestore, setDoc, doc, collection, addDoc } from "firebase/firestore"
import { firebaseConfig } from "../../firebaseConfig"  // ← 修正版firebaseConfigと連携

// 🔹 Firebase 初期化（Next.js対応）
const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
const db = getFirestore(app)

/**
 * 🔧 Firestore 初期データを登録する関数
 * 管理者が最初に実行することで、景品・称号・サンプル生徒などを登録。
 */
export async function initializeFirestoreData() {
  console.log("🔥 Firestore 初期データ登録を開始します...")

  try {
    // --- 🎁 景品 ---
    const rewards = [
      { id: "snackSet", name: "お菓子詰め合わせ", cost: 15, stock: 20, limitPerUser: 0, category: "お菓子", icon: "cookie" },
      { id: "pen", name: "高級ペン", cost: 50, stock: 5, limitPerUser: 1, category: "文房具", icon: "pen" },
      { id: "eraser", name: "消しゴム", cost: 10, stock: 30, limitPerUser: 3, category: "文房具", icon: "eraser" },
      { id: "note", name: "ノート", cost: 20, stock: 10, limitPerUser: 2, category: "文房具", icon: "book" },
    ]
    for (const r of rewards) {
      await setDoc(doc(db, "rewards", r.id), r, { merge: true })
    }
    console.log("✅ 景品データを登録しました")

    // --- 🏅 称号 ---
    const titles = [
      { id: "effortAward", name: "努力賞", condition: "宿題を10回提出", description: "コツコツ努力を積み重ねた証", bonus: 10 },
      { id: "vocabularyMaster", name: "単語マスター", condition: "英単語テストで90点以上を5回取得", description: "語彙力が着実にアップ！", bonus: 20 },
      { id: "perfectAttendance", name: "皆勤賞", condition: "4週間連続でチェックイン", description: "毎日の努力は力になる！", bonus: 15 },
    ]
    for (const t of titles) {
      await setDoc(doc(db, "titles", t.id), t, { merge: true })
    }
    console.log("✅ 称号データを登録しました")

    // --- 🧑‍🎓 サンプル生徒 ---
    const testUserId = "testUser"
    const testUser = {
      displayName: "テスト生徒",
      email: "student@example.com",
      level: 1,
      experience: 0,
      points: 100,
      grade: "中2",
      avatar: "cat",
      createdAt: new Date(),
    }
    await setDoc(doc(db, "users", testUserId), testUser, { merge: true })
    console.log("✅ サンプルユーザーを登録しました")

    // --- 🧾 サブコレクション初期化 ---
    const userPath = `users/${testUserId}`

    await Promise.all([
      addDoc(collection(db, userPath, "checkins"), {
        date: new Date(),
        status: "出席",
        pointsEarned: 5,
      }),
      addDoc(collection(db, userPath, "homeworks"), {
        subject: "数学",
        status: "提出済み",
        score: 90,
        submittedAt: new Date(),
      }),
      addDoc(collection(db, userPath, "wordtests"), {
        correct: 35,
        total: 40,
        xp: 45,
        date: new Date(),
      }),
      addDoc(collection(db, userPath, "titles"), {
        name: "努力賞",
        earnedAt: new Date(),
        selected: true,
      }),
      addDoc(collection(db, userPath, "rewardHistory"), {
        name: "お菓子詰め合わせ",
        cost: 15,
        date: new Date(),
        status: "未確認",
      }),
    ])

    console.log("✅ サブコレクションを追加しました")
    console.log("🎉 Firestore 初期化が完了しました！")

  } catch (error) {
    console.error("❌ Firestore 初期化中にエラー:", error)
  }
}
