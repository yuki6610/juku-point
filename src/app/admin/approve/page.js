'use client'

import './approve.css'
import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection, doc, onSnapshot, updateDoc, deleteDoc,
  serverTimestamp, addDoc, increment
} from 'firebase/firestore'

const GRADE_OPTIONS = ['全学年', '中1', '中2', '中3']
const SUBJECTS = [
  { key: '国', label: '国語' },
  { key: '社', label: '社会' },
  { key: '数', label: '数学' },
  { key: '理', label: '理科' },
  { key: '英', label: '英語' },
]

const gradeLabel = g => (g >= 7 && g <= 9 ? `中${g - 6}` : '学年不明')

const calcReward = score => {
  if (score.type === 'exam') {
    const base = Number(score.examConverted || 0)
    return { point: Math.floor(base), exp: Math.floor(base / 2) }
  }
  if (score.type === 'internal') {
    const base = Number(score.internalTotal || 0)
    return { point: base, exp: Math.floor(base / 2) }
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

  useEffect(() => {
    const auth = getAuth()
    return onAuthStateChanged(auth, u => {
      setAdmin(u)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!admin) return
    return onSnapshot(collection(db, 'users'), snap =>
      setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    )
  }, [admin])

  useEffect(() => {
    if (!selectedStudentId) return
    setSelectedStudent(students.find(s => s.uid === selectedStudentId))
    return onSnapshot(
      collection(db, `users/${selectedStudentId}/scores`),
      snap => setScores(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [selectedStudentId, students])

  if (loading) return <p>読み込み中...</p>
  if (!admin) return <p>管理者ログインが必要です</p>

  const filteredStudents = students.filter(
    s => gradeFilter === '全学年' || gradeLabel(s.grade) === gradeFilter
  )
  const pendingScores = scores.filter(s => !s.approved)

  const approveScore = async score => {
    const { point, exp } = calcReward(score)
    const userRef = doc(db, `users/${selectedStudentId}`)

    await updateDoc(doc(db, `users/${selectedStudentId}/scores/${score.id}`), {
      approved: true,
      approvedAt: serverTimestamp(),
      approvedBy: admin.uid,
      rewardPoint: point,
      rewardExp: exp,
    })

    await addDoc(collection(db, `users/${selectedStudentId}/pointHistory`), {
      type: 'score',
      scoreType: score.type,
      point,
      exp,
      description: score.type === 'exam' ? 'テスト成績承認' : '内申点承認',
      createdAt: serverTimestamp(),
    })

    await updateDoc(userRef, {
      points: increment(point),
      experience: increment(exp),
    })
  }

  const deleteScore = async score => {
    if (!confirm('この成績を削除しますか？')) return
    await deleteDoc(doc(db, `users/${selectedStudentId}/scores/${score.id}`))
  }

  return (
    <div className="page">
      <h1>管理者：成績承認</h1>

      <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
        {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
      </select>

      <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
        <option value="">生徒を選択</option>
        {filteredStudents.map(s => (
          <option key={s.uid} value={s.uid}>{s.realName}</option>
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
                <div className="score-meta">
                  {score.type === 'exam' ? 'テスト' : '内申'}｜
                    {score.year} {score.term} {score.testType}
                </div>
                <div className="score-summary">
                  付与：{reward.point}pt / {reward.exp}exp
                </div>
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
