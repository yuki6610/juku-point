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

  // ================================
  // 学年表示ラベル
  // ================================
  const gradeLabel = (g) => ({
    7: '中1',
    8: '中2',
    9: '中3',
    10: '高1',
    11: '高2',
    12: '高3',
  }[Number(g)] || '未設定')

  // ================================
  // 経験値 & ポイント計算
  // ================================
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

        const testRef = doc(db, 'users/${d.id}/wordtests/${selectedWeek}')
        const testSnap = await getDoc(testRef)
        const test = testSnap.exists() ? testSnap.data() : {}

        return {
          id: d.id,
          name: data.realName || data.displayName || '名無し',
          grade: Number(data.grade) || null,
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

  // ================================
  // 提出処理
  // ================================
    const submitTest = async (studentId, correct, total) => {
      if (!correct || !total) return alert('正答数と問題数を入力してください')

      const accuracy = correct / total
      const passed = accuracy >= 0.7

      const rewards = passed ? calcScoreRewards(correct, total) : { exp: 0, points: 0 }
      const { exp, points } = rewards

      const ref = doc(db, `users/${studentId}/wordtests/${selectedWeek}`)

      await setDoc(ref, {
        correct,
        total,
        accuracy,
        exp,
        points,
        passed,
        submitted: true,
        submittedAt: new Date().toISOString(),
      })

      // 🔥 正解数は常に加算（ランキング用）
      await updateDoc(doc(db, "users", studentId), {
        totalWordTestScore: increment(correct)
      })

      await incrementCounter(studentId, "wordTestCount")

      let result = { levelUps: 0, newLevel: 0 }

      if (passed) {
        result = await updateExperience(studentId, exp, 'wordtest', points)

        await addDoc(collection(db, `users/${studentId}/pointHistory`), {
          type: "wordtest",
          amount: points,
          exp,
          correct,
          total,
          week: selectedWeek,
          createdAt: new Date()
        })
      }

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? { ...s, submitted: true, correct, total, exp, pointsEarned: points, accuracy }
            : s
        )
      )

      if (passed && result.levelUps > 0) {
        const before = result.newLevel - result.levelUps
        const after = result.newLevel
        setLevelText(`🎉 レベルアップ！ Lv${before} → Lv${after}`)
        setShowLevelUp(true)
        setTimeout(() => setShowLevelUp(false), 3000)
      }
    }

  // ================================
  // 取消処理
  // ================================
    const undoTest = async (studentId) => {
      const ref = doc(db, `users/${studentId}/wordtests/${selectedWeek}`)
      const snap = await getDoc(ref)
      if (!snap.exists()) return

      const { exp, points, correct, passed } = snap.data()

      await setDoc(ref, {
        submitted: false,
        correct: 0,
        total: 0,
        accuracy: 0,
        exp: 0,
        points: 0,
        passed: false,
        submittedAt: null,
      })

      await updateDoc(doc(db, "users", studentId), {
        totalWordTestScore: increment(-correct)
      })

      if (passed) {
        await updateExperience(studentId, -exp, "wordtest_undo", -points)
      }

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? { ...s, submitted: false, correct: "", total: "", accuracy: null }
            : s
        )
      )
    }
  // ================================
  // 週関連
  // ================================
  function getCurrentWeek() {
    const now = new Date()
    const year = now.getFullYear()
    const week = Math.ceil(((now - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7)
    return '${year}-W${week}'
  }

  function getWeekLabel(weekStr) {
    const [y, w] = weekStr.split('-W')
    const year = Number(y)
    const week = Number(w)
    const first = new Date(year, 0, 1)
    const monday = new Date(first.setDate(first.getDate() - first.getDay() + 1 + (week - 1) * 7))
    return `${year}-${String(monday.getMonth() + 1).padStart(2, '0')}/${String(monday.getDate()).padStart(2, '0')}`
  }

  function getPastWeeks(n = 8) {
    const res = []
    const now = new Date()
    for (let i = 0; i < n; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() - i * 7)
      const y = d.getFullYear()
      const w = Math.ceil(((d - new Date(y, 0, 1)) / 86400000 + new Date(y, 0, 1).getDay() + 1) / 7)
      res.push(`${y}-W${w}`)
    }
    return res
  }

  // ================================
  // 学年フィルタ
  // ================================
  const filteredStudents =
    selectedGrade === 'all'
      ? students
      : students.filter(s => s.grade === Number(selectedGrade))

  return (
    <div className="wt-page">
      <h1 className="wt-title">🧠 英単語テスト管理ページ</h1>

      <div className="wt-filters">
        <div className="wt-filter-group">
          <label>週：</label>
          <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
            {getPastWeeks(16).map(w => (
              <option key={w} value={w}>{getWeekLabel(w)}</option>
            ))}
          </select>
        </div>

        <div className="wt-filter-group">
          <label>学年：</label>
          <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}>
            <option value="all">すべて</option>
            <option value="7">中1</option>
            <option value="8">中2</option>
            <option value="9">中3</option>
            <option value="10">高1</option>
            <option value="11">高2</option>
            <option value="12">高3</option>
          </select>
        </div>
      </div>

      <p className="wt-week-label">📆 表示週：{getWeekLabel(selectedWeek)}</p>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <div className="wt-grid">
          {filteredStudents.map(s => (
            <div key={s.id} className="wt-card">
              <h3 className="wt-name">{s.name}</h3>

              <div className="wt-grade">
                <GradeTag grade={gradeLabel(s.grade)} />
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
                        setStudents(prev =>
                          prev.map(x =>
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
                        setStudents(prev =>
                          prev.map(x =>
                            x.id === s.id ? { ...x, total: Number(e.target.value) } : x
                          )
                        )
                      }
                    />
                  </div>

                  <button onClick={() => submitTest(s.id, s.correct, s.total)} className="wt-btn-submit">
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

      {showLevelUp && <div className="wt-levelup-popup">{levelText}</div>}
    </div>
  )
}
