'use client'

import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'

import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc
} from 'firebase/firestore'

import './score.css'

const GRADES = ['中1', '中2', '中3']
const SCHOOL_YEARS = ['2025', '2026', '2027', '2028']
const TERMS = ['1学期', '2学期', '3学期']

const BASE_TEST_TYPES = [
  '中間',
  '期末',
  '春課題実力',
  '夏課題実力',
  '秋課題実力',
  '冬課題実力'
]

const PAST_EXAMS = [
  '過去問2016',
  '過去問2017',
  '過去問2018',
  '過去問2019',
  '過去問2020',
  '過去問2021',
  '過去問2022',
  '過去問2023',
  '過去問2024',
  '過去問2025'
]

const MAIN = ['国語', '社会', '数学', '理科', '英語']
const SUB = ['音楽', '美術', '保体', '技家']

const gradeLabel = g =>
  g >= 7 && g <= 9 ? `中${g - 6}` : '不明'

export default function AdminScoresPage() {
  const [admin, setAdmin] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)

  const [saved, setSaved] = useState([])

  const [grade, setGrade] = useState('中1')
  const [term, setTerm] = useState('1学期')
  const [testType, setTestType] = useState('中間')
  const [schoolYear, setSchoolYear] = useState('2026')

  const [internalGrade, setInternalGrade] = useState('中1')
  const [internalTerm, setInternalTerm] = useState('1学期')

  const [exam, setExam] = useState(
    Object.fromEntries(MAIN.map(s => [s, '']))
  )

  const [internalMain, setInternalMain] = useState(
    Object.fromEntries(MAIN.map(s => [s, 3]))
  )

  const [internalSub, setInternalSub] = useState(
    Object.fromEntries(SUB.map(s => [s, 3]))
  )

  const [editingScoreId, setEditingScoreId] = useState(null)

  /* =====================
     管理者認証
  ===================== */
  useEffect(() => {
    const auth = getAuth()

    return onAuthStateChanged(auth, async user => {
      setAdmin(user)
      setCheckingAuth(false)
    })
  }, [])

  /* =====================
     生徒一覧
  ===================== */
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), snap => {
      setStudents(
        snap.docs.map(d => ({
          uid: d.id,
          ...d.data()
        }))
      )
    })
  }, [])

  /* =====================
     選択生徒
  ===================== */
  useEffect(() => {
    if (!selectedStudentId) {
      setSelectedStudent(null)
      setSaved([])
      return
    }

    const student = students.find(
      s => s.uid === selectedStudentId
    )

    setSelectedStudent(student)

    return onSnapshot(
      query(
        collection(db, `users/${selectedStudentId}/scores`),
        orderBy('createdAt', 'desc')
      ),
      snap => {
        setSaved(
          snap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }))
        )
      }
    )
  }, [selectedStudentId, students])

  if (checkingAuth) return <p>確認中...</p>

  if (!admin) return <p>ログインしてください</p>

  /* =====================
     計算
  ===================== */
  const examTotal = Object.values(exam)
    .reduce((a, b) => a + Number(b || 0), 0)

  const examConverted = examTotal * 0.5

  const internalTotal =
    Object.values(internalMain)
      .reduce((a, b) => a + b, 0) * 4 +
    Object.values(internalSub)
      .reduce((a, b) => a + b, 0) * 7.5

  const isPastExamStudent =
    selectedStudent?.grade === 9 &&
    Array.isArray(selectedStudent?.courseTags) &&
    selectedStudent.courseTags.includes('past_exam')

  const TEST_TYPES =
    isPastExamStudent && grade === '中3'
      ? [...BASE_TEST_TYPES, ...PAST_EXAMS]
      : BASE_TEST_TYPES

  /* =====================
     重複確認
  ===================== */
  const isDuplicateExam = () =>
    saved.some(
      s =>
        s.type === 'exam' &&
        s.year === schoolYear &&
        s.term === term &&
        s.testType === testType &&
        s.id !== editingScoreId
    )

  const isDuplicateInternal = () =>
    saved.some(
      s =>
        s.type === 'internal' &&
        s.year === schoolYear &&
        s.term === internalTerm &&
        s.id !== editingScoreId
    )

  /* =====================
     テスト保存
  ===================== */
  const saveExam = async () => {
    if (!selectedStudentId) {
      alert('生徒を選択してください')
      return
    }

    if (!confirm('この内容で保存しますか？')) return

    if (isDuplicateExam()) {
      alert('同じテストデータがあります')
      return
    }

    const data = {
      type: 'exam',
      year: schoolYear,
      term,
      testType,
      exam,
      examTotal,
      examConverted,
      grade: Number(grade.replace('中', '')) + 6,
      approved: true,
      updatedAt: serverTimestamp(),
    }

    if (editingScoreId) {
      await updateDoc(
        doc(
          db,
          `users/${selectedStudentId}/scores/${editingScoreId}`
        ),
        data
      )
    } else {
      await addDoc(
        collection(db, `users/${selectedStudentId}/scores`),
        {
          ...data,
          createdAt: serverTimestamp(),
        }
      )
    }

    alert('保存しました')

    setEditingScoreId(null)
  }

  /* =====================
     内申保存
  ===================== */
  const saveInternal = async () => {
    if (!selectedStudentId) {
      alert('生徒を選択してください')
      return
    }

    if (!confirm('この内容で保存しますか？')) return

    if (isDuplicateInternal()) {
      alert('同じ内申データがあります')
      return
    }

    const data = {
      type: 'internal',
      year: schoolYear,
      term: internalTerm,
      internalMain,
      internalSub,
      internalTotal,
      grade: Number(internalGrade.replace('中', '')) + 6,
      approved: true,
      updatedAt: serverTimestamp(),
    }

    if (editingScoreId) {
      await updateDoc(
        doc(
          db,
          `users/${selectedStudentId}/scores/${editingScoreId}`
        ),
        data
      )
    } else {
      await addDoc(
        collection(db, `users/${selectedStudentId}/scores`),
        {
          ...data,
          createdAt: serverTimestamp(),
        }
      )
    }

    alert('保存しました')

    setEditingScoreId(null)
  }

  return (
    <div className="admin-score-page">
      <h1>管理者 成績入力</h1>

      {/* 生徒選択 */}
      <div className="student-select-box">
        <select
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
        >
          <option value="">生徒を選択</option>

          {students.map(s => (
            <option key={s.uid} value={s.uid}>
              {s.realName || s.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* テスト入力 */}
      <div className="score-block">
        <h2>五教科テスト</h2>

        <div className="row-inline">
          <select
            value={schoolYear}
            onChange={e => setSchoolYear(e.target.value)}
          >
            {SCHOOL_YEARS.map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>

          <select
            value={grade}
            onChange={e => setGrade(e.target.value)}
          >
            {GRADES.map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>

          <select
            value={term}
            onChange={e => setTerm(e.target.value)}
          >
            {TERMS.map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>

          <select
            value={testType}
            onChange={e => setTestType(e.target.value)}
          >
            {TEST_TYPES.map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>

        <div className="grid">
          {MAIN.map(s => (
            <div key={s}>
              <label>{s}</label>

              <input
                value={exam[s]}
                inputMode="numeric"
                onChange={e =>
                  setExam({
                    ...exam,
                    [s]: e.target.value.replace(/\D/g, ''),
                  })
                }
              />
            </div>
          ))}
        </div>

        <p>
          5計:{examTotal}点 / 換算:{examConverted}点
        </p>

        <button onClick={saveExam}>
          テスト保存
        </button>
      </div>

      {/* 内申 */}
      <div className="score-block">
        <h2>内申点</h2>

        <div className="row-inline">
          <select
            value={schoolYear}
            onChange={e => setSchoolYear(e.target.value)}
          >
            {SCHOOL_YEARS.map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>

          <select
            value={internalGrade}
            onChange={e =>
              setInternalGrade(e.target.value)
            }
          >
            {GRADES.map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>

          <select
            value={internalTerm}
            onChange={e =>
              setInternalTerm(e.target.value)
            }
          >
            {TERMS.map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>

        <div className="grid">
          {MAIN.map(s => (
            <select
              key={s}
              value={internalMain[s]}
              onChange={e =>
                setInternalMain({
                  ...internalMain,
                  [s]: +e.target.value,
                })
              }
            >
              {[1, 2, 3, 4, 5].map(v => (
                <option key={v} value={v}>
                  {s}:{v}
                </option>
              ))}
            </select>
          ))}
        </div>

        <div className="grid">
          {SUB.map(s => (
            <select
              key={s}
              value={internalSub[s]}
              onChange={e =>
                setInternalSub({
                  ...internalSub,
                  [s]: +e.target.value,
                })
              }
            >
              {[1, 2, 3, 4, 5].map(v => (
                <option key={v} value={v}>
                  {s}:{v}
                </option>
              ))}
            </select>
          ))}
        </div>

        <p>内申点:{internalTotal}点</p>

        <button onClick={saveInternal}>
          内申保存
        </button>
      </div>

      {/* 保存済み */}
      <div className="saved-list">
        <h2>保存済みデータ</h2>

        {saved.map(s => (
          <div key={s.id} className="saved-card">
            {s.type === 'exam' ? (
              <>
                <p>
                  {gradeLabel(s.grade)} / {s.term} /{' '}
                  {s.testType}
                </p>

                <p>
                  5計 {s.examTotal}点 / 換算{' '}
                  {s.examConverted}点
                </p>
              </>
            ) : (
              <>
                <p>
                  {gradeLabel(s.grade)} / {s.term}
                </p>

                <p>
                  内申 {s.internalTotal}点
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
