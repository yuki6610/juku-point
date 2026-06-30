'use client'

import './homework.css'
import GradeTag from '../../../components/GradeTag'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '../../../firebaseConfig'
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { updateExperience} from '../../utils/updateExperience'
import { incrementCounter } from "../../../lib/updateCounters"

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

        const hwRef = doc(
          db,
          `users/${d.id}/homeworks/${selectedWeek}`
        )

        const hwSnap = await getDoc(hwRef)

        return {
          id: d.id,
          name: data.realName || data.displayName || '名無し',
          grade: Number(data.grade) || null,
          level: data.level ?? 1,
          experience: data.experience ?? 0,
          points: data.points ?? 0,
          submitted: hwSnap.exists()
            ? hwSnap.data().submitted
            : false,
          yellowCard: data.yellowCard ?? false,
          banned: data.banned ?? false,
        }
      })
    )

    setStudents(list)
    setLoading(false)
  }

  // ===================================
  // 提出
  // ===================================
  const submitHomework = async (
    studentId,
    currentSubmitted
  ) => {
    if (currentSubmitted) return

    const hwRef = doc(
      db,
      `users/${studentId}/homeworks/${selectedWeek}`
    )

    await setDoc(hwRef, {
      submitted: true,
      submittedAt: new Date().toISOString(),
      missed: false,
    })

    const result = await updateExperience(
      studentId,
      50,
      'homework',
      50
    )

        await incrementCounter(studentId, [
          "homeworkCount",
          "termHomeworkCount",
        ])

    const historyRef = doc(
      collection(db, `users/${studentId}/pointHistory`)
    )

    await setDoc(historyRef, {
      type: "homework",
      amount: 50,
      note: "宿題提出",
      createdAt: new Date().toISOString(),
    })

    if (result.levelUps > 0) {
      setLevelText(
        `🎉 レベルアップ！ Lv${result.oldLevel} → Lv${result.newLevel}`
      )

      setShowLevelUp(true)

      setTimeout(() => {
        setShowLevelUp(false)
      }, 3000)
    }

    setStudents(prev =>
      prev.map(s =>
        s.id === studentId
          ? { ...s, submitted: true }
          : s
      )
    )
  }

  // ===================================
  // 提出取消
  // ===================================
  const undoHomework = async (studentId) => {
    const hwRef = doc(
      db,
      `users/${studentId}/homeworks/${selectedWeek}`
    )

    await setDoc(hwRef, {
      submitted: false,
      submittedAt: null,
      missed: false,
    })

    await updateExperience(
      studentId,
      -50,
      'homework_undo',
      -50
    )

    const historyRef = doc(
      collection(db, `users/${studentId}/pointHistory`)
    )

    await setDoc(historyRef, {
      type: "undo_homework",
      amount: -50,
      note: "宿題提出取消",
      createdAt: new Date().toISOString(),
    })

    setStudents(prev =>
      prev.map(s =>
        s.id === studentId
          ? { ...s, submitted: false }
          : s
      )
    )
  }

  // ===================================
  // 未提出
  // ===================================
  const markUnsubmitted = async (studentId) => {
    if (!confirm('未提出にしますか？')) return

    const hwRef = doc(
      db,
      `users/${studentId}/homeworks/${selectedWeek}`
    )

    await setDoc(hwRef, {
      submitted: false,
      submittedAt: null,
      missed: true,
      missedAt: new Date().toISOString(),
    })

    await updateExperience(
      studentId,
      -50,
      'homework_missed',
      -50
    )

    const historyRef = doc(
      collection(db, `users/${studentId}/pointHistory`)
    )

    await setDoc(historyRef, {
      type: 'homework_missed',
      amount: -50,
      note: '宿題未提出',
      createdAt: new Date().toISOString(),
    })

    setStudents(prev =>
      prev.map(s =>
        s.id === studentId
          ? { ...s, submitted: false }
          : s
      )
    )
  }

  function getCurrentWeek() {
    const now = new Date()
    const year = now.getFullYear()

    const week = Math.ceil(
      (
        (
          now - new Date(year, 0, 1)
        ) / 86400000 +
        new Date(year, 0, 1).getDay() +
        1
      ) / 7
    )

    return `${year}-W${week}`
  }

  function getWeekLabel(weekStr) {
    const [yearStr, w] = weekStr.split('-W')

    const year = parseInt(yearStr)
    const week = parseInt(w)

    const firstDay = new Date(year, 0, 1)

    const monday = new Date(
      firstDay.setDate(
        firstDay.getDate() -
        firstDay.getDay() +
        1 +
        (week - 1) * 7
      )
    )

    return `${year}-${String(
      monday.getMonth() + 1
    ).padStart(2, '0')}/${String(
      monday.getDate()
    ).padStart(2, '0')}`
  }

  function getPastWeeks(n = 8) {
    return Array.from({ length: n }, (_, i) => {
      const d = new Date()

      d.setDate(d.getDate() - i * 7)

      const y = d.getFullYear()

      const w = Math.ceil(
        (
          (
            d - new Date(y, 0, 1)
          ) / 86400000 +
          new Date(y, 0, 1).getDay() +
          1
        ) / 7
      )

      return `${y}-W${w}`
    })
  }

  const filteredStudents =
    selectedGrade === 'all'
      ? students
      : students.filter(
          s => s.grade === Number(selectedGrade)
        )

  const gradeLabel = (g) =>
    ({
      7: '中1',
      8: '中2',
      9: '中3',
      10: '高1',
      11: '高2',
      12: '高3',
    }[Number(g)] || '未設定')

  return (
    <div className="hw-page">
      <h1 className="hw-title">
        📚 宿題確認ページ
      </h1>

      <div className="hw-filters">
        <select
          value={selectedWeek}
          onChange={e =>
            setSelectedWeek(e.target.value)
          }
        >
          {getPastWeeks(16).map(w => (
            <option key={w} value={w}>
              {getWeekLabel(w)}
            </option>
          ))}
        </select>

        <select
          value={selectedGrade}
          onChange={e =>
            setSelectedGrade(e.target.value)
          }
        >
          <option value="all">全学年</option>
          <option value="7">中1</option>
          <option value="8">中2</option>
          <option value="9">中3</option>
          <option value="10">高1</option>
          <option value="11">高2</option>
          <option value="12">高3</option>
        </select>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <div className="hw-grid">
          {filteredStudents.map(s => (
            <div
              key={s.id}
              className={`hw-card ${
                s.banned ? 'is-banned' : ''
              }`}
            >
              <h3>{s.name}</h3>

              <GradeTag
                grade={gradeLabel(s.grade)}
              />

              <div className="status-badges">
                {s.yellowCard && (
                  <span className="badge yellow">
                    ⚠ イエロー
                  </span>
                )}

                {s.banned && (
                  <span className="badge red">
                    ⛔ 出禁
                  </span>
                )}
              </div>

              <p>
                Lv.{s.level}
                （Exp {s.experience}）
              </p>

              <p>
                Pts {s.points}
              </p>

              {!s.submitted ? (
                <>
                  <button
                    disabled={s.banned}
                    onClick={() =>
                      submitHomework(
                        s.id,
                        s.submitted
                      )
                    }
                    className="hw-btn-submit"
                  >
                    提出確認
                  </button>

                  <button
                    disabled={s.banned}
                    onClick={() =>
                      markUnsubmitted(s.id)
                    }
                    className="hw-btn-miss"
                  >
                    未提出
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled
                    className="hw-btn-submit"
                  >
                    提出済み
                  </button>

                  <button
                    onClick={() =>
                      undoHomework(s.id)
                    }
                    className="hw-btn-undo"
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => router.push('/admin')}
        className="hw-back-btn"
      >
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
