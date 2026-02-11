'use client'

import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore'
import './behavior.css'

const GRADE_OPTIONS = ['全学年', '中1', '中2', '中3']
const TERMS = ['1学期', '2学期', '3学期']

const gradeLabel = g => g >= 7 && g <= 9 ? `中${g - 6}` : '不明'

export default function AdminBehaviorPage() {
  const [admin, setAdmin] = useState(null)
  const [students, setStudents] = useState([])
  const [gradeFilter, setGradeFilter] = useState('全学年')
  const [studentId, setStudentId] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)

  const [date, setDate] = useState('')
  const [term, setTerm] = useState('1学期')
  const [homework, setHomework] = useState('submitted')
  const [attendance, setAttendance] = useState('ontime')
  const [forgot, setForgot] = useState(false)

  /* ===== 認証 ===== */
  useEffect(() => {
    return onAuthStateChanged(getAuth(), u => setAdmin(u))
  }, [])

  /* ===== 生徒一覧 ===== */
  useEffect(() => {
    if (!admin) return
    return onSnapshot(collection(db, 'users'), snap => {
      setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    })
  }, [admin])

  /* ===== 生徒選択 ===== */
  useEffect(() => {
    setSelectedStudent(students.find(s => s.uid === studentId) || null)
  }, [studentId, students])

  if (!admin) return <p>管理者ログインが必要です</p>

  const filteredStudents = students.filter(s => {
    if (gradeFilter === '全学年') return true
    return gradeLabel(s.grade) === gradeFilter
  })

  /* ===== 保存 ===== */
  const saveBehavior = async () => {
    if (!studentId || !date) {
      alert('日付と生徒は必須です')
      return
    }

    const year = date.slice(0, 4)
    const summaryId = `${year}_${term}`

    /* =====================
       ① 生ログ（円グラフ用）
    ===================== */
    await addDoc(
      collection(db, 'users', selectedStudent.uid, 'behaviorLogs'),
      {
        date,
        year,
        term,
        homework,
        attendance,
        forgot,
        createdAt: serverTimestamp(),
      }
    )

    /* =====================
       ② 集計ログ（相関図用）
       ※ ここが最終仕様
    ===================== */
    const summaryRef = doc(
      db,
      'users',
      selectedStudent.uid,
      'behaviorSummary',
      summaryId
    )

    const snap = await getDoc(summaryRef)

    const base = snap.exists()
      ? snap.data()
      : {
          homework: { submitted: 0, partial: 0, missed: 0 },
          attendance: { ontime: 0, late: 0 },
          forgot: 0,
          lessonCount: 0,
        }

    if (homework === 'submitted') base.homework.submitted++
    if (homework === 'partial') base.homework.partial++
    if (homework === 'missed') base.homework.missed++

    if (attendance === 'ontime') base.attendance.ontime++
    if (attendance === 'late') base.attendance.late++

    if (forgot) base.forgot++

    base.lessonCount++

    const behaviorScore =
      base.homework.submitted +
      base.attendance.ontime -
      base.homework.missed -
      base.attendance.late -
      base.forgot

    await setDoc(summaryRef, {
      ...base,
      behaviorScore: Math.max(0, Math.min(32, behaviorScore)),
      year,
      term,
      updatedAt: serverTimestamp(),
    })

    alert('保存しました')
  }

  return (
    <div className="admin-behavior-page">
      <h1>管理者：生活態度記録</h1>

      <div className="filter-row">
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
          {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
        </select>

        <select value={studentId} onChange={e => setStudentId(e.target.value)}>
          <option value="">生徒を選択</option>
          {filteredStudents.map(s =>
            <option key={s.uid} value={s.uid}>{s.realName}</option>
          )}
        </select>
      </div>

      {!selectedStudent && (
        <p className="hint">生徒を選択すると入力欄が表示されます</p>
      )}

      {selectedStudent && (
        <div className="form-card">
          <h2>{selectedStudent.realName}</h2>

          <div className="form-grid">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />

            <select value={term} onChange={e => setTerm(e.target.value)}>
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>

            <select value={homework} onChange={e => setHomework(e.target.value)}>
              <option value="submitted">宿題：提出</option>
              <option value="partial">宿題：途中</option>
              <option value="missed">宿題：忘れ</option>
            </select>

            <select value={attendance} onChange={e => setAttendance(e.target.value)}>
              <option value="ontime">出席：時間通り</option>
              <option value="late">出席：遅刻</option>
            </select>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={forgot}
                onChange={e => setForgot(e.target.checked)}
              />
              忘れ物あり
            </label>
          </div>

          <button className="save-btn" onClick={saveBehavior}>
            保存
          </button>
        </div>
      )}
    </div>
  )
}
