'use client'

import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
    getDocs,
    serverTimestamp,
  deleteDoc
} from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import './behavior-history.css'

const GRADE_OPTIONS = ['全学年', '中1', '中2', '中3']
const TERMS = ['1学期', '2学期', '3学期']

const gradeLabel = g => g >= 7 && g <= 9 ? `中${g - 6}` : '不明'

export default function BehaviorHistoryPage() {
  const [admin, setAdmin] = useState(null)
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  const [gradeFilter, setGradeFilter] = useState('全学年')
  const [logs, setLogs] = useState([])

  // ⭐ 編集用
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({
    date: '',
    term: '1学期',
    homework: 'submitted',
    attendance: 'ontime',
    forgot: false,
  })

  const router = useRouter()

  /* 認証 */
  useEffect(() => {
    return onAuthStateChanged(getAuth(), u => setAdmin(u))
  }, [])

  /* 生徒一覧 */
  useEffect(() => {
    if (!admin) return
    return onSnapshot(collection(db, 'users'), snap => {
      setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    })
  }, [admin])

  /* ログ取得 */
  useEffect(() => {
    if (!studentId) return

    return onSnapshot(
      collection(db, 'users', studentId, 'behaviorLogs'),
      snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => b.date.localeCompare(a.date))

        setLogs(list)
      }
    )
  }, [studentId])

  if (!admin) return <p>管理者ログインが必要です</p>

  const filteredStudents = students.filter(s => {
    if (gradeFilter === '全学年') return true
    return gradeLabel(s.grade) === gradeFilter
  })
      
      const rebuildSummary = async () => {
        const snap = await getDocs(
          collection(db, 'users', studentId, 'behaviorLogs')
        )

        const logs = snap.docs.map(d => d.data())

        const summaries = {}

        logs.forEach(l => {
          const key = `${l.year}_${l.term}`

          if (!summaries[key]) {
            summaries[key] = {
              homework: { submitted: 0, partial: 0, missed: 0 },
              attendance: { ontime: 0, late: 0 },
              forgot: 0,
              lessonCount: 0,
              year: l.year,
              term: l.term,
            }
          }

          const base = summaries[key]

          if (l.homework === 'submitted') base.homework.submitted++
          if (l.homework === 'partial') base.homework.partial++
          if (l.homework === 'missed') base.homework.missed++

          if (l.attendance === 'ontime') base.attendance.ontime++
          if (l.attendance === 'late') base.attendance.late++

          if (l.forgot) base.forgot++

          base.lessonCount++
        })

        for (const key in summaries) {
          const base = summaries[key]

          const hwTotal =
            base.homework.submitted +
            base.homework.partial +
            base.homework.missed

          const attendanceTotal =
            base.attendance.ontime + base.attendance.late

          const hwRate =
            hwTotal > 0
              ? (base.homework.submitted + base.homework.partial * 0.5) / hwTotal
              : 1

          const attendanceRate =
            attendanceTotal > 0
              ? base.attendance.ontime / attendanceTotal
              : 1

          const latePenalty = base.attendance.late * 5
          const forgotPenalty = base.forgot * 4

          let behaviorScore =
            hwRate * 40 +
            attendanceRate * 40 +
            20 - latePenalty - forgotPenalty

          behaviorScore = Math.max(0, Math.min(100, behaviorScore))

          await setDoc(
            doc(db, 'users', studentId, 'behaviorSummary', key),
            {
              ...base,
              behaviorScore: Math.round(behaviorScore),
              updatedAt: serverTimestamp(),
            }
          )
        }
      }

  /* ===== 編集開始 ===== */
  const startEdit = (log) => {
    setEditingId(log.id)
    setEditData({
      date: log.date,
      term: log.term,
      homework: log.homework ?? 'none',
      attendance: log.attendance,
      forgot: log.forgot,
    })
  }

  /* ===== 更新 ===== */
    const updateLog = async () => {
      if (!editingId) return

      const year = editData.date.slice(0, 4)

      await setDoc(
        doc(db, 'users', studentId, 'behaviorLogs', editingId),
        {
          ...editData,
          year
        },
        { merge: true }
      )

      await rebuildSummary()

      setEditingId(null)
    }

  /* ===== 削除 ===== */
  const deleteLog = async (id) => {
    if (!confirm('削除しますか？')) return
    await deleteDoc(doc(db, 'users', studentId, 'behaviorLogs', id))
        
        await rebuildSummary()
  }

  return (
    <div className="history-page">
      <h1 className="history-title">生活態度 履歴</h1>

      {/* 学年フィルター */}
      <select
        className="history-select"
        value={gradeFilter}
        onChange={e => setGradeFilter(e.target.value)}
      >
        {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
      </select>

      {/* 生徒選択 */}
      <select
        className="history-select"
        value={studentId}
        onChange={e => setStudentId(e.target.value)}
      >
        <option value="">生徒を選択</option>
        {filteredStudents.map(s => (
          <option key={s.uid} value={s.uid}>
            {s.realName}
          </option>
        ))}
      </select>

      {/* ⭐ 編集フォーム */}
      {editingId && (
        <div className="edit-box">
          <h3>✏️ 編集中</h3>

          <input
            type="date"
            value={editData.date}
            onChange={e => setEditData({ ...editData, date: e.target.value })}
          />

          <select
            value={editData.term}
            onChange={e => setEditData({ ...editData, term: e.target.value })}
          >
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </select>

          <select
            value={editData.homework}
            onChange={e => setEditData({ ...editData, homework: e.target.value })}
          >
            <option value="submitted">提出</option>
            <option value="partial">途中</option>
            <option value="missed">忘れ</option>
            <option value="none">なし</option>
          </select>

          <select
            value={editData.attendance}
            onChange={e => setEditData({ ...editData, attendance: e.target.value })}
          >
            <option value="ontime">時間通り</option>
            <option value="late">遅刻</option>
          </select>

          <label>
            <input
              type="checkbox"
              checked={editData.forgot}
              onChange={e => setEditData({ ...editData, forgot: e.target.checked })}
            />
            忘れ物あり
          </label>

          <button onClick={updateLog}>更新</button>
        </div>
      )}

      {/* データなし */}
      {logs.length === 0 && (
        <p className="empty">データがありません</p>
      )}

      {/* 履歴一覧 */}
      {logs.map(log => (
        <div key={log.id} className="history-card">
          <div className="history-date">📅 {log.date}</div>

          <div className="history-row">
            宿題：
            <span className={`badge ${
              log.homework === 'submitted' ? 'good' :
              log.homework === 'partial' ? 'normal' :
              log.homework === 'missed' ? 'bad' : ''
            }`}>
              {log.homework ?? 'なし'}
            </span>
          </div>

          <div className="history-row">
            出席：
            <span className={`badge ${
              log.attendance === 'ontime' ? 'good' : 'bad'
            }`}>
              {log.attendance === 'ontime' ? '時間通り' : '遅刻'}
            </span>
          </div>

          <div className="history-row">
            忘れ物：
            <span className={`badge ${log.forgot ? 'warn' : 'good'}`}>
              {log.forgot ? 'あり' : 'なし'}
            </span>
          </div>

          {/* ⭐ 操作ボタン */}
          <div className="history-actions">
            <button onClick={() => startEdit(log)}>編集</button>
            <button onClick={() => deleteLog(log.id)}>削除</button>
          </div>
        </div>
      ))}

      <button className="back-btn" onClick={() => router.push('/admin')}>
        戻る
      </button>
    </div>
  )
}
