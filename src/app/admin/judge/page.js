'use client'

import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,
  onSnapshot,
} from 'firebase/firestore'

import './judge.css'
import ScoreBreakdown from '@/components/ScoreBreakdown'

/* =====================
   定数
===================== */
const GRADE_OPTIONS = ['全学年', '中1', '中2', '中3']

/* =====================
   学年ラベル
===================== */
const gradeLabel = grade => {
  if (grade >= 7 && grade <= 9) return `中${grade - 6}`
  if (grade >= 10 && grade <= 12) return `高${grade - 9}`
  return '学年不明'
}

/* =====================
   判定ロジック（生徒画面と同一）
===================== */
const judgeResult = (myScore, minScore) => {
  const diff = myScore - minScore

  if (diff >= 20) {
    return { diff, label: '◎ 安全圏', className: 'safe' }
  }
  if (diff >= 0) {
    return { diff, label: '○ 合格圏', className: 'ok' }
  }
  if (diff >= -20) {
    return { diff, label: '△ 努力圏', className: 'warn' }
  }
  return { diff, label: '× 厳しい', className: 'ng' }
}

export default function AdminJudgePage() {
  /* =====================
     state
  ===================== */
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)

  const [students, setStudents] = useState([])
  const [gradeFilter, setGradeFilter] = useState('全学年')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)

  const [scores, setScores] = useState([])
  const [examScore, setExamScore] = useState(null)
  const [internalScore, setInternalScore] = useState(null)

  const [schools, setSchools] = useState([])

  /* =====================
     認証
  ===================== */
  useEffect(() => {
    const auth = getAuth()
    return onAuthStateChanged(auth, u => {
      setAdmin(u)
      setLoading(false)
    })
  }, [])

  /* =====================
     生徒一覧
  ===================== */
  useEffect(() => {
    if (!admin) return

    return onSnapshot(collection(db, 'users'), snap => {
      setStudents(
        snap.docs.map(d => ({
          uid: d.id,
          ...d.data(),
        }))
      )
    })
  }, [admin])

  /* =====================
     生徒の成績
  ===================== */
  useEffect(() => {
    if (!selectedStudentId) {
      setScores([])
      setSelectedStudent(null)
      return
    }

    const student = students.find(s => s.uid === selectedStudentId)
    setSelectedStudent(student)

    return onSnapshot(
      collection(db, `users/${selectedStudentId}/scores`),
      snap => {
        setScores(
          snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
          }))
        )
      }
    )
  }, [selectedStudentId, students])

  /* =====================
     高校マスタ
  ===================== */
  useEffect(() => {
    return onSnapshot(collection(db, 'schools'), snap => {
      setSchools(
        snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
        }))
      )
    })
  }, [])

  if (loading) return <p>読み込み中...</p>
  if (!admin) return <p>管理者ログインが必要です</p>

  /* =====================
     学年フィルタ
  ===================== */
  const filteredStudents = students.filter(s => {
    if (gradeFilter === '全学年') return true
    return gradeLabel(s.grade) === gradeFilter
  })

  /* =====================
     判定点数
  ===================== */
  const myTotal =
    (examScore?.examConverted || 0) +
    (internalScore?.internalTotal || 0)

  /* =====================
     高校ソート（最低点 高い順）
  ===================== */
  const sortedSchools = [...schools].sort(
    (a, b) => Number(b.minScore) - Number(a.minScore)
  )

  return (
    <div className="page judge-page">
      <h1>管理者：志望校判定確認</h1>

      {/* =====================
         生徒選択
      ===================== */}
      <div className="row no-print">
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
          {GRADE_OPTIONS.map(g => (
            <option key={g}>{g}</option>
          ))}
        </select>

        <select
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
        >
          <option value="">生徒を選択</option>
          {filteredStudents.map(s => (
            <option key={s.uid} value={s.uid}>
              {s.realName}
            </option>
          ))}
        </select>
      </div>

      {selectedStudent && (
        <>
          {/* =====================
             成績選択
          ===================== */}
          <div className="score-select no-print">
            <h3>志望校判定に使う成績</h3>

            <select
              value={examScore?.id || ''}
              onChange={e =>
                setExamScore(scores.find(s => s.id === e.target.value))
              }
            >
              <option value="">テストを選択</option>
              {scores
                .filter(s => s.type === 'exam')
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.year} {s.term}｜5計 {s.examTotal}点 ／ 入試換算点 {s.examConverted}点
                  </option>
                ))}
            </select>

            <select
              value={internalScore?.id || ''}
              onChange={e =>
                setInternalScore(scores.find(s => s.id === e.target.value))
              }
            >
              <option value="">内申を選択</option>
              {scores
                .filter(s => s.type === 'internal')
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.year} {s.term}｜内申点 {s.internalTotal}点
                  </option>
                ))}
            </select>
          </div>
                           
                           <ScoreBreakdown
                             exam={examScore}
                             internal={internalScore}
                           />

          {/* =====================
             志望校判定表
          ===================== */}
          <div className="judge-block">
            <h2>
              志望校判定：{selectedStudent.realName}
            </h2>

            <table className="compare-table">
              <thead>
                <tr>
                  <th>高校名</th>
                  <th>合格最低点</th>
                  <th>あなたの点数</th>
                  <th>差</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {sortedSchools.map(school => {
                  const r = judgeResult(myTotal, school.minScore)
                  return (
                    <tr key={school.id}>
                      <td>{school.name}</td>
                      <td>{school.minScore}</td>
                      <td>{myTotal}</td>
                      <td className={r.className}>{r.diff}</td>
                      <td className={r.className}>{r.label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* =====================
             印刷
          ===================== */}
          <div className="print-area no-print">
            <button onClick={() => window.print()}>
              🖨 面談用に印刷
            </button>
          </div>
        </>
      )}
    </div>
  )
}
