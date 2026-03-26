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
  const [allPendingScores, setAllPendingScores] = useState([])

  /* ---------- 認証 ---------- */
  useEffect(() => {
    const auth = getAuth()
    return onAuthStateChanged(auth, u => {
      setAdmin(u)
      setLoading(false)
    })
  }, [])

  /* ---------- 生徒一覧 ---------- */
  useEffect(() => {
    if (!admin) return
    return onSnapshot(collection(db, 'users'), snap =>
      setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    )
  }, [admin])

  /* ---------- 個別スコア ---------- */
  useEffect(() => {
    if (!selectedStudentId) return
    setSelectedStudent(students.find(s => s.uid === selectedStudentId))

    return onSnapshot(
      collection(db, `users/${selectedStudentId}/scores`),
      snap => setScores(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [selectedStudentId, students])

  /* ---------- 全体未承認 ---------- */
  useEffect(() => {
    if (!admin) return

    const unsubscribers = []

    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }))

      users.forEach(user => {
        const unsubScore = onSnapshot(
          collection(db, `users/${user.uid}/scores`),
          scoreSnap => {
            setAllPendingScores(prev => {
              const filtered = prev.filter(p => p.uid !== user.uid)

              const newOnes = scoreSnap.docs
                .map(d => ({
                  id: d.id,
                  uid: user.uid,
                  userName: user.realName,
                  grade: user.grade,
                  ...d.data()
                }))
                .filter(s => !s.approved)

              return [...filtered, ...newOnes]
            })
          }
        )
        unsubscribers.push(unsubScore)
      })
    })

    return () => {
      unsub()
      unsubscribers.forEach(u => u())
    }
  }, [admin])

  if (loading) return <p>読み込み中...</p>
  if (!admin) return <p>管理者ログインが必要です</p>

  /* ---------- フィルタ ---------- */
  const filteredStudents = students.filter(
    s => gradeFilter === '全学年' || gradeLabel(s.grade) === gradeFilter
  )

  const pendingScores = scores.filter(s => !s.approved)

  const filteredAllPending = allPendingScores.filter(
    s => gradeFilter === '全学年' || gradeLabel(s.grade) === gradeFilter
  )

  /* ---------- 承認 ---------- */
  const approveScore = async score => {
    const { point, exp } = calcReward(score)
    const userRef = doc(db, `users/${score.uid}`)

    await updateDoc(doc(db, `users/${score.uid}/scores/${score.id}`), {
      approved: true,
      approvedAt: serverTimestamp(),
      approvedBy: admin.uid,
      rewardPoint: point,
      rewardExp: exp,
    })

    await addDoc(collection(db, `users/${score.uid}/pointHistory`), {
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

  /* ---------- 削除 ---------- */
  const deleteScore = async score => {
    if (!confirm('この成績を削除しますか？')) return
    await deleteDoc(doc(db, `users/${score.uid}/scores/${score.id}`))
  }

  return (
    <div className="page">
      <h1>管理者：成績承認</h1>

      {/* 学年フィルタ */}
      <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
        {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
      </select>

      {/* ---------- 全体 ---------- */}
      <h2>🔥 未承認成績（全体）</h2>

      {filteredAllPending.length === 0 && <p>未承認はありません</p>}

      {filteredAllPending.map(score => {
        const reward = calcReward(score)
        return (
          <div key={score.uid + score.id} className="approve-card">
            <div className="score-meta">
              【{score.userName}（{gradeLabel(score.grade)}）】
              {score.type === 'exam' ? 'テスト' : '内申'}｜
              {score.year} {score.term} {score.testType}
            </div>

                <div className="score-summary">

                  {/* ===== 教科点数 ===== */}
                  {score.type === 'exam' && (
                    <div className="subject-scores">
                                             国:{score.exam?.['国語'] ?? '-'}/
                                                 数:{score.exam?.['数学'] ?? '-'}/
                                                 英:{score.exam?.['英語'] ?? '-'}/
                                                 理:{score.exam?.['理科'] ?? '-'}/
                                                 社:{score.exam?.['社会'] ?? '-'}
                    </div>
                  )}

                  {/* ===== 内申 ===== */}
                {score.type === 'internal' && (
                  <div>
                    {/* 主教科 */}
                    国:{score.internalMain?.['国語']??'-'}/
                    数:{score.internalMain?.['数学'] ?? '-'}/
                    英:{score.internalMain?.['英語'] ?? '-'}/
                    理:{score.internalMain?.['理科'] ?? '-'}/
                    社:{score.internalMain?.['社会'] ?? '-'}
                    
                    <br/>

                    {/* 副教科 */}
                    音:{score.internalSub?.['音楽'] ?? '-'}/
                    美:{score.internalSub?.['美術'] ?? '-'}/
                    保:{score.internalSub?.['保体'] ?? '-'}/
                    技:{score.internalSub?.['技家'] ?? '-'}
                  </div>
                )}

                  {/* ===== 合計 ===== */}
                  <div className="total-score">
                    {score.type === 'exam'
                      ? `5計：${score.examTotal ?? '-'} / 入試換算：${score.examConverted ?? '-'}`
                      : `内申合計：${score.internalTotal ?? '-'}`
                    }
                  </div>

                  {/* ===== 付与 ===== */}
                  <div className="reward">
                    付与：{reward.point}pt / {reward.exp}exp
                  </div>

                </div>

            <div className="approve-actions">
              <button onClick={() => approveScore(score)}>承認</button>
              <button onClick={() => deleteScore(score)}>削除</button>
            </div>
          </div>
        )
      })}

      {/* ---------- 個別 ---------- */}
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
                  {score.type === 'exam'?'テスト':'内申'}｜
                  {score.grade} {score.term} {score.testType}
                </div>

                <div className="score-summary">
                  付与：{reward.point}pt / {reward.exp}exp
                </div>

                <div className="approve-actions">
                  <button onClick={() => approveScore({ ...score, uid: selectedStudentId })}>
                    承認
                  </button>
                  <button onClick={() => deleteScore({ ...score, uid: selectedStudentId })}>
                    削除
                  </button>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
