'use client'

import './approve.css'
import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore'

/* =====================
   定数
===================== */
const GRADE_OPTIONS = ['全学年', '中1', '中2', '中3']

const SUBJECTS = [
  { key: '国', label: '国語' },
  { key: '社', label: '社会' },
  { key: '数', label: '数学' },
  { key: '理', label: '理科' },
  { key: '英', label: '英語' },
]

/* =====================
   学年ラベル
===================== */
const gradeLabel = grade => {
  if (grade >= 7 && grade <= 9) return `中${grade - 6}`
  if (grade >= 10 && grade <= 12) return `高${grade - 9}`
  return '学年不明'
}

/* =====================
   報酬計算（要件準拠）
===================== */
const calcReward = score => {
  if (score.type === 'exam') {
    const base = Number(score.examConverted || 0)
    return {
      point: Math.floor(base / 1),
      exp: Math.floor(base / 2),
    }
  }

  if (score.type === 'internal') {
    const base = Number(score.internalTotal || 0)
    return {
      point: base,
      exp: Math.floor(base / 2),
    }
  }

  return { point: 0, exp: 0 }
}

export default function AdminApprovePage() {
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)

  const [students, setStudents] = useState([])
  const [gradeFilter, setGradeFilter] = useState('全学年')

  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)

  const [scores, setScores] = useState([])

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
     成績取得
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

  if (loading) return <p>読み込み中...</p>
  if (!admin) return <p>管理者ログインが必要です</p>

  /* =====================
     フィルタ
  ===================== */
  const filteredStudents = students.filter(s => {
    if (gradeFilter === '全学年') return true
    return gradeLabel(s.grade) === gradeFilter
  })

  const pendingScores = scores.filter(s => !s.approved)

  /* =====================
     承認処理
  ===================== */
  const approveScore = async score => {
    const { point, exp } = calcReward(score)

    await updateDoc(
      doc(db, `users/${selectedStudentId}/scores/${score.id}`),
      {
        approved: true,
        approvedAt: serverTimestamp(),
        approvedBy: admin.uid,
        rewardPoint: point,
        rewardExp: exp,
      }
    )

    await addDoc(
      collection(db, `users/${selectedStudentId}/pointHistory`),
      {
        type: 'score',
        scoreType: score.type,
        point,
        exp,
        description:
          score.type === 'exam'
            ? 'テスト成績承認'
            : '内申点承認',
        createdAt: serverTimestamp(),
      }
    )
  }

  /* =====================
     削除
  ===================== */
  const deleteScore = async score => {
    if (!confirm('この成績を削除しますか？')) return
    await deleteDoc(
      doc(db, `users/${selectedStudentId}/scores/${score.id}`)
    )
  }

  return (
    <div className="page">
      <h1>管理者：成績承認</h1>

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

      {selectedStudent && (
        <>
          <h2>承認待ち成績：{selectedStudent.realName}</h2>

          {pendingScores.length === 0 && <p>承認待ちはありません</p>}

          {pendingScores.map(score => {
            const reward = calcReward(score)

            return (
              <div key={score.id} className="approve-card">
                <div className="approve-card-header">
                  <div>
                    <div className="student-name">
                      {selectedStudent.realName}
                      <span className="grade">
                        （{gradeLabel(selectedStudent.grade)}）
                      </span>
                    </div>
                    <div className="score-meta">
                      {score.type === 'exam'
                        ? `五教科テスト｜${score.year} ${score.term}`
                        : `内申点｜${score.year} ${score.term}`}
                    </div>
                  </div>
                  <span className={`score-type ${score.type}`}>
                    {score.type === 'exam' ? 'テスト' : '内申'}
                  </span>
                </div>

                {score.type === 'exam' && (
                  <>
                    <div className="score-grid">
                      {SUBJECTS.map(sub => (
                        <div key={sub.key} className="score-cell">
                          <span className="label">{sub.label}</span>
                          <span className="value">
                            {score.exam?.[sub.key] ?? '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="score-summary">
                      合計 {score.examTotal} ／ 換算 {score.examConverted}
                      <br />
                      付与：{reward.point}pt / {reward.exp}exp
                    </div>
                  </>
                )}

                {score.type === 'internal' && (
                  <div className="score-summary internal">
                    内申合計：{score.internalTotal}
                    <br />
                    付与：{reward.point}pt / {reward.exp}exp
                  </div>
                )}

                <div className="approve-actions">
                  <button onClick={() => approveScore(score)}>承認</button>
                  <button onClick={() => deleteScore(score)}>削除</button>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
