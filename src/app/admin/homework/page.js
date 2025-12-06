'use client'

import './homework.css'   // ← 追加：PC向けCSSファイル
import GradeTag from '../../../components/GradeTag'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '../../../firebaseConfig'
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { updateExperience, checkAndGrantTitles } from '../../utils/updateExperience';
import { incrementCounter } from "../../../lib/updateCounters";

export default function HomeworkPage() {
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

  async function loadStudents() {
    setLoading(true)
    const snap = await getDocs(collection(db, 'users'))
    const list = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data()
        const hwRef = doc(db, `users/${d.id}/homeworks/${selectedWeek}`)
        const hwSnap = await getDoc(hwRef)
        return {
          id: d.id,
          name: data.realName || data.displayName || '名無し',
          grade: data.grade ?? '未設定',
          level: data.level ?? 1,
          experience: data.experience ?? 0,
          points: data.points ?? 0,
          submitted: hwSnap.exists() ? hwSnap.data().submitted : false,
        }
      })
    )
    setStudents(list)
    setLoading(false)
  }

  const submitHomework = async (studentId, currentSubmitted) => {
    if (currentSubmitted) return
    const hwRef = doc(db, `users/${studentId}/homeworks/${selectedWeek}`)
    await setDoc(hwRef, {
      submitted: true,
      submittedAt: new Date().toISOString(),
    })

    const result = await updateExperience(studentId, 50, 'homework', 50)
    await incrementCounter(studentId, "homeworkCount");
    await checkAndGrantTitles(studentId);
      
      // 🔵 ポイント履歴に追加
      const historyRef = doc(collection(db, `users/${studentId}/pointHistory`))
      await setDoc(historyRef, {
        type: "homework",
        amount:+50,
        message: "宿題提出ボーナス",
        createdAt: new Date().toISOString(),
      })

    if (result.levelUps > 0) {
      const before = result.oldLevel ?? result.newLevel - 1
      const after = result.newLevel
      setLevelText(`🎉 レベルアップ！ Lv${before} → Lv${after}`)
      setShowLevelUp(true)
      setTimeout(() => setShowLevelUp(false), 3000)
    }

    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, submitted: true } : s))
    )
  }

  const undoHomework = async (studentId) => {
    const hwRef = doc(db, `users/${studentId}/homeworks/${selectedWeek}`)
    await setDoc(hwRef, { submitted: false, submittedAt: null })
    await updateExperience(studentId, -50, 'homework_undo', -50)
      
      // 🔴 ポイント履歴に追加（取消 → マイナス）
      const historyRef = doc(collection(db, `users/${studentId}/pointHistory`))
      await setDoc(historyRef, {
        type: "undo_homework",
        amount: -50,
        message: "宿題提出取消",
        createdAt: new Date().toISOString(),
      })
      
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, submitted: false } : s))
    )
  }

  function getCurrentWeek() {
    const now = new Date()
    const year = now.getFullYear()
    const week = Math.ceil(( (now - new Date(year,0,1)) / 86400000 + new Date(year,0,1).getDay() + 1 ) / 7)
    return `${year}-W${week}`
  }

  function getWeekLabel(weekStr) {
    const [yearStr, w] = weekStr.split('-W')
    const year = parseInt(yearStr)
    const week = parseInt(w)
    const firstDay = new Date(year, 0, 1)
    const monday = new Date(firstDay.setDate(firstDay.getDate() - firstDay.getDay() + 1 + (week - 1) * 7))
    const month = String(monday.getMonth() + 1).padStart(2, '0')
    const day = String(monday.getDate()).padStart(2, '0')
    return `${year}-${month}/${day}`
  }

  function getPastWeeks(n = 8) {
    const result = []
    const current = new Date()
    for (let i = 0; i < n; i++) {
      const temp = new Date(current)
      temp.setDate(current.getDate() - i * 7)
      const year = temp.getFullYear()
      const week = Math.ceil(( (temp - new Date(year,0,1)) / 86400000 + new Date(year,0,1).getDay() + 1 ) / 7)
      result.push(`${year}-W${week}`)
    }
    return result
  }

  const filteredStudents =
    selectedGrade === 'all'
      ? students
      : students.filter((s) => s.grade === selectedGrade)

  return (
    <div className="hw-page">
      <h1 className="hw-title">📚 宿題確認ページ</h1>

      {/* フィルタ */}
      <div className="hw-filters">
        <div className="hw-filter-group">
          <label>週：</label>
          <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
            {getPastWeeks(16).map((w) => (
              <option key={w} value={w}>
                {getWeekLabel(w)}
              </option>
            ))}
          </select>
        </div>

        <div className="hw-filter-group">
          <label>学年：</label>
          <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}>
            <option value="all">すべて</option>
            <option value="中1">中1</option>
            <option value="中2">中2</option>
            <option value="中3">中3</option>
          </select>
        </div>
      </div>

      <p className="week-label">📆 表示週：{getWeekLabel(selectedWeek)}</p>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <div className="hw-grid">
          {filteredStudents.map((s) => (
            <div key={s.id} className="hw-card">
              <h3 className="hw-name">{s.name}</h3>

              <div className="hw-grade">
                <GradeTag grade={s.grade ?? '未設定'} />
              </div>

              <p className="hw-status">Lv.{s.level}（Exp：{s.experience}）</p>
              <p className="hw-status">Pts：{s.points}</p>

              <div className="hw-buttons">
                <button
                  disabled={s.submitted}
                  onClick={() => submitHomework(s.id, s.submitted)}
                  className={s.submitted ? "hw-btn-done" : "hw-btn-submit"}
                >
                  {s.submitted ? '✅ 提出済み' : '提出確認'}
                </button>

                {s.submitted && (
                  <button onClick={() => undoHomework(s.id)} className="hw-btn-undo">
                    取消
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => router.push('/admin')} className="hw-back-btn">
        ⬅ 管理ページへ戻る
      </button>

      {showLevelUp && (
        <div className="hw-levelup-popup">
          {levelText}
        </div>
      )}
    </div>
  )
}
