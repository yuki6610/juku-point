'use client'

import './tango.css'
import GradeTag from '../../../components/GradeTag'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '../../../firebaseConfig'
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  increment
} from 'firebase/firestore'
import { updateExperience, checkAndGrantTitles } from '../../utils/updateExperience'
import { incrementCounter } from "../../../lib/updateCounters"

export default function WordTestPage() {
  const router = useRouter()
  const [students, setStudents] = useState([])
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek())
  const [selectedGrade, setSelectedGrade] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [levelText, setLevelText] = useState('')

  useEffect(() => {
    loadStudents()
  }, [selectedWeek])

  // 🧮 経験値 & ポイント計算
  const calcScoreRewards = (correct, total) => {
    if (!total || total <= 0 || correct < 0) return { exp: 0, points: 0 }

    const accuracy = correct / total
    const effortFactor = Math.pow(total / 30, 0.8)
    const bonus = accuracy === 1 ? 1.1 : accuracy >= 0.9 ? 1.05 : 1.0

    const exp = Math.round(100 * accuracy * effortFactor * bonus)
    const points = Math.round(100 * accuracy * effortFactor * bonus)
    return { exp, points }
  }

  async function loadStudents() {
    setLoading(true)
    const snap = await getDocs(collection(db, 'users'))

    const list = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data()

        const testRef = doc(db, `users/${d.id}/wordtests/${selectedWeek}`)
        const testSnap = await getDoc(testRef)
        const test = testSnap.exists() ? testSnap.data() : {}

        return {
          id: d.id,
          name: data.realName || data.displayName || '名無し',
          grade: data.grade ?? '未設定',
          level: data.level ?? 1,
          experience: data.experience ?? 0,
          points: data.points ?? 0,
          correct: test.correct ?? '',
          total: test.total ?? '',
          accuracy: test.accuracy ?? null,
          submitted: test.submitted ?? false,
          exp: test.exp ?? 0,
          pointsEarned: test.points ?? 0,
        }
      })
    )

    setStudents(list)
    setLoading(false)
  }

  // =========================================================
  // 📝 単語テスト提出（累計得点は increment に統合）
  // =========================================================
  const submitTest = async (studentId, correct, total) => {
    if (!correct || !total) return alert('正答数と問題数を入力してください')

    const { exp, points } = calcScoreRewards(correct, total)
    const ref = doc(db, `users/${studentId}/wordtests/${selectedWeek}`)

    // 個別週データ保存
    await setDoc(ref, {
      correct,
      total,
      accuracy: correct / total,
      exp,
      points,
      submitted: true,
      submittedAt: new Date().toISOString(),
    })

    // XP & ポイント加算
    const result = await updateExperience(studentId, exp, 'wordtest', points)

    // ★ ポイント履歴
    await addDoc(collection(db, `users/${studentId}/pointHistory`), {
      type: "wordtest",
      amount: points,
      exp: exp,
      correct,
      total,
      week: selectedWeek,
      createdAt: new Date()
    })

    // ★ 累計単語テスト得点（increment方式）
    await updateDoc(doc(db, "users", studentId), {
      totalWordTestScore: increment(correct)
    })

    // ★ テスト回数カウント
    await incrementCounter(studentId, "wordTestCount")

    // 称号付与
    await checkAndGrantTitles(studentId)

    // UI 反映
    setStudents(prev =>
      prev.map(s =>
        s.id === studentId
          ? { ...s, submitted: true, correct, total, exp, pointsEarned: points, accuracy: correct / total }
          : s
      )
    )

    // レベルアップ演出
    if (result.levelUps > 0) {
      const before = result.newLevel - result.levelUps
      const after = result.newLevel
      setLevelText(`🎉 レベルアップ！ Lv${before} → Lv${after}`)
      setShowLevelUp(true)
      setTimeout(() => setShowLevelUp(false), 3000)
    }
  }

  // =========================================================
  // 🔄 取消処理（累計得点は decrement）
  // =========================================================
  const undoTest = async (studentId) => {
    const ref = doc(db, `users/${studentId}/wordtests/${selectedWeek}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const { exp, points, correct } = snap.data();

    // 個別週データリセット
    await setDoc(ref, {
      submitted: false,
      correct: 0,
      total: 0,
      accuracy: 0,
      exp: 0,
      points: 0,
      submittedAt: null,
    });

    // 経験値・ポイント巻き戻し
    await updateExperience(studentId, -exp, "wordtest_undo", -points);

    // 元の履歴削除
    const historyRef = collection(db, `users/${studentId}/pointHistory`);
    const historySnap = await getDocs(historyRef);

    const deleteTargets = historySnap.docs.filter(
      (d) => d.data().type === "wordtest" && d.data().week === selectedWeek
    );

    for (const h of deleteTargets) {
      await deleteDoc(doc(db, `users/${studentId}/pointHistory/${h.id}`));
    }

    // 取消履歴の追加
    await addDoc(historyRef, {
      type: "undotest",
      amount: -points,
      exp: -exp,
      week: selectedWeek,
      createdAt: new Date(),
      message: "単語テスト取消",
    });

    // ★ 累計得点を decrement
    await updateDoc(doc(db, "users", studentId), {
      totalWordTestScore: increment(-correct)
    })

    // UI 反映
    setStudents(prev =>
      prev.map((s) =>
        s.id === studentId
          ? { ...s, submitted: false, correct: "", total: "", accuracy: null }
          : s
      )
    );
  };

  // 週処理などはそのまま維持
  function getCurrentWeek() {
    const now = new Date()
    const year = now.getFullYear()
    const week = Math.ceil(((now - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7)
    return `${year}-W${week}`
  }

  function getWeekLabel(weekStr) {
    const [yearStr, w] = weekStr.split('-W')
    const year = Number(yearStr)
    const week = Number(w)
    const firstDay = new Date(year, 0, 1)
    const monday = new Date(firstDay.setDate(firstDay.getDate() - firstDay.getDay() + 1 + (week - 1) * 7))
    return `${year}-${String(monday.getMonth() + 1).padStart(2, '0')}/${String(monday.getDate()).padStart(2, '0')}`
  }

  function getPastWeeks(n = 8) {
    const result = []
    const current = new Date()
    for (let i = 0; i < n; i++) {
      const temp = new Date(current)
      temp.setDate(current.getDate() - i * 7)
      const y = temp.getFullYear()
      const w = Math.ceil(((temp - new Date(y, 0, 1)) / 86400000 + new Date(y, 0, 1).getDay() + 1) / 7)
      result.push(`${y}-W${w}`)
    }
    return result
  }

  const filteredStudents =
    selectedGrade === 'all'
      ? students
      : students.filter((s) => s.grade === selectedGrade)

  return (
    <div className="wt-page">
      <h1 className="wt-title">🧠 英単語テスト管理ページ</h1>

      <div className="wt-filters">
        <div className="wt-filter-group">
          <label>週：</label>
          <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
            {getPastWeeks(16).map((w) => (
              <option key={w} value={w}>{getWeekLabel(w)}</option>
            ))}
          </select>
        </div>

        <div className="wt-filter-group">
          <label>学年：</label>
          <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}>
            <option value="all">すべて</option>
            <option value="中1">中1</option>
            <option value="中2">中2</option>
            <option value="中3">中3</option>
          </select>
        </div>
      </div>

      <p className="wt-week-label">📆 表示週：{getWeekLabel(selectedWeek)}</p>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <div className="wt-grid">
          {filteredStudents.map((s) => (
            <div key={s.id} className="wt-card">
              <h3 className="wt-name">{s.name}</h3>

              <div className="wt-grade">
                <GradeTag grade={s.grade ?? '未設定'} />
              </div>

              <p className="wt-status">Lv.{s.level}（Exp：{s.experience}）</p>
              <p className="wt-status">Pts：{s.points}</p>

              {!s.submitted ? (
                <>
                  <div className="wt-input-row">
                    <input
                      type="number"
                      placeholder="正答数"
                      value={s.correct}
                      onChange={(e) =>
                        setStudents((prev) =>
                          prev.map((x) =>
                            x.id === s.id ? { ...x, correct: Number(e.target.value) } : x
                          )
                        )
                      }
                    />
                    <input
                      type="number"
                      placeholder="問題数"
                      value={s.total}
                      onChange={(e) =>
                        setStudents((prev) =>
                          prev.map((x) =>
                            x.id === s.id ? { ...x, total: Number(e.target.value) } : x
                          )
                        )
                      }
                    />
                  </div>

                  <button
                    onClick={() => submitTest(s.id, s.correct, s.total)}
                    className="wt-btn-submit"
                  >
                    登録・反映
                  </button>
                </>
              ) : (
                <>
                  <p>✅ {s.correct} / {s.total} 問（{(s.accuracy * 100).toFixed(1)}%）</p>
                  <p>＋{s.exp}XP / ＋{s.pointsEarned}Pt</p>

                  <button onClick={() => undoTest(s.id)} className="wt-btn-undo">取消</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button onClick={() => router.push('/admin')} className="wt-back-btn">
        ⬅ 管理ページに戻る
      </button>

      {showLevelUp && (
        <div className="wt-levelup-popup">{levelText}</div>
      )}
    </div>
  )
}
