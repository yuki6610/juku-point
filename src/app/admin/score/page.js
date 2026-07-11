'use client'

import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'

import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc
} from 'firebase/firestore'

import './score.css'

const GRADES=['中1','中2','中3']
const SCHOOL_YEARS=['2025','2026','2027','2028']
const TERMS=['1学期','2学期','3学期']

const BASE_TEST_TYPES=[
  '中間','期末','春課題実力','1学期実力','夏課題実力','2学期実力','冬課題実力','3学期実力'
]

const PAST_EXAMS=[
  '過去問2016','過去問2017','過去問2018','過去問2019',
  '過去問2020','過去問2021','過去問2022','過去問2023',
  '過去問2024','過去問2025'
]

const MAIN=['国語','社会','数学','理科','英語']
const SUB=['音楽','美術','保体','技家']

const gradeLabel=g=>g>=7&&g<=9?`中${g-6}`:'不明'

const formatSavedAt=value=>{
  if(!value) return '保存日時不明'
  const date=typeof value.toDate==='function'?value.toDate():new Date(value)
  if(Number.isNaN(date.getTime())) return '保存日時不明'
  return new Intl.DateTimeFormat('ja-JP',{
    year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'
  }).format(date)
}

export default function AdminScoresPage() {
  const [admin,setAdmin]=useState(null)
  const [checkingAuth,setCheckingAuth]=useState(true)

  const [students,setStudents]=useState([])
  const [selectedStudentId,setSelectedStudentId]=useState('')
  const [selectedStudent,setSelectedStudent]=useState(null)
  const [saved,setSaved]=useState([])

  const [gradeFilter,setGradeFilter]=useState('all')

  const [grade,setGrade]=useState('中1')
  const [term,setTerm]=useState('1学期')
  const [testType,setTestType]=useState('中間')
  const [schoolYear,setSchoolYear]=useState('2026')

  const [internalGrade,setInternalGrade]=useState('中1')
  const [internalTerm,setInternalTerm]=useState('1学期')

  const [exam,setExam]=useState(Object.fromEntries(MAIN.map(s=>[s,''])))
  const [internalMain,setInternalMain]=useState(Object.fromEntries(MAIN.map(s=>[s,3])))
  const [internalSub,setInternalSub]=useState(Object.fromEntries(SUB.map(s=>[s,3])))

  const [editingScoreId,setEditingScoreId]=useState(null)

  useEffect(()=>{
    const auth=getAuth()
    return onAuthStateChanged(auth,async user=>{
      if (!user) {
        setAdmin(null)
        setCheckingAuth(false)
        return
      }

      const adminSnap = await getDoc(doc(db, 'admins', user.uid))
      setAdmin(adminSnap.exists() ? user : null)
      setCheckingAuth(false)
    })
  },[])

  useEffect(()=>{
    if (!admin) return

    let active = true
    getDocs(collection(db,'users')).then(snap=>{
      if (!active) return
      setStudents(
        snap.docs
          .map(d=>({
            uid:d.id,
            ...d.data()
          }))
          .filter(s=>Number(s.grade)>=7&&Number(s.grade)<=9)
          .sort((a,b)=>
            Number(a.grade||0)-Number(b.grade||0) ||
            String(a.realName||a.displayName||'').localeCompare(String(b.realName||b.displayName||''),'ja')
          )
      )
    })

    return () => {
      active = false
    }
  },[admin])

  useEffect(()=>{
    if(!selectedStudentId){
      setSelectedStudent(null)
      setSaved([])
      return
    }

    setSelectedStudent(
      students.find(s=>s.uid===selectedStudentId)
    )

    return onSnapshot(
      query(
        collection(db,`users/${selectedStudentId}/scores`),
        orderBy('createdAt','desc')
      ),
      snap=>{
        setSaved(
          snap.docs.map(d=>({
            id:d.id,
            ...d.data()
          }))
        )
      }
    )
  },[selectedStudentId,students])

  if(checkingAuth) return <p>確認中...</p>
  if(!admin) return <p>ログインしてください</p>

  const examTotal=Object.values(exam).reduce((a,b)=>a+Number(b||0),0)
  const examConverted=examTotal*0.5

  const internalTotal=
    Object.values(internalMain).reduce((a,b)=>a+b,0)*4+
    Object.values(internalSub).reduce((a,b)=>a+b,0)*7.5

  const TEST_TYPES=
    selectedStudent?.grade===9 &&
    selectedStudent?.courseTags?.includes('past_exam') &&
    grade==='中3'
      ? [...BASE_TEST_TYPES,...PAST_EXAMS]
      : BASE_TEST_TYPES

  const isDuplicateExam=()=>saved.some(
    s=>
      s.type==='exam' &&
      s.year===schoolYear &&
      s.term===term &&
      s.testType===testType &&
      s.id!==editingScoreId
  )

  const isDuplicateInternal=()=>saved.some(
    s=>
      s.type==='internal' &&
      s.year===schoolYear &&
      s.term===internalTerm &&
      s.id!==editingScoreId
  )

  const filteredStudents=
    gradeFilter==='all'
      ? students
      : students.filter(s=>Number(s.grade)===Number(gradeFilter))

  const saveExam=async()=>{
    if(!selectedStudentId) return alert('生徒を選択してください')
    if(!confirm('この内容で保存しますか？')) return
    if(isDuplicateExam()) return alert('同じテストデータがあります')

    const data={
      type:'exam',
      year:schoolYear,
      term,
      testType,
      exam,
      examTotal,
      examConverted,
      grade:Number(grade.replace('中',''))+6,
      submittedBy:'admin',
      updatedAt:new Date(),
    }

    editingScoreId
      ? await updateDoc(
          doc(db,`users/${selectedStudentId}/scores/${editingScoreId}`),
          data
        )
      : await addDoc(
          collection(db,`users/${selectedStudentId}/scores`),
          {
            ...data,
            createdAt:new Date(),
          }
        )

    alert('保存しました')
    setEditingScoreId(null)
  }

  const saveInternal=async()=>{
    if(!selectedStudentId) return alert('生徒を選択してください')
    if(!confirm('この内容で保存しますか？')) return
    if(isDuplicateInternal()) return alert('同じ内申データがあります')

    const data={
      type:'internal',
      year:schoolYear,
      term:internalTerm,
      internalMain,
      internalSub,
      internalTotal,
      grade:Number(internalGrade.replace('中',''))+6,
      submittedBy:'admin',
      updatedAt:new Date(),
    }

    editingScoreId
      ? await updateDoc(
          doc(db,`users/${selectedStudentId}/scores/${editingScoreId}`),
          data
        )
      : await addDoc(
          collection(db,`users/${selectedStudentId}/scores`),
          {
            ...data,
            createdAt:new Date(),
          }
        )

    alert('保存しました')
    setEditingScoreId(null)
  }

  const deleteScore=async(scoreId)=>{
    if(!selectedStudentId) return
    if(!confirm('このデータを削除しますか？')) return

    await deleteDoc(
      doc(db,`users/${selectedStudentId}/scores/${scoreId}`)
    )

    alert('削除しました')
  }

  return (
    <div className="admin-score-page">
      <h1>成績確認・入力</h1>

      <div className="student-select-box">
        <select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}>
          <option value="all">全学年</option>
          <option value="7">中1</option>
          <option value="8">中2</option>
          <option value="9">中3</option>
        </select>

        <select value={selectedStudentId} onChange={e=>setSelectedStudentId(e.target.value)}>
          <option value="">生徒を選択</option>

          {filteredStudents.map(s=>(
            <option key={s.uid} value={s.uid}>
              {gradeLabel(s.grade)} {s.realName || s.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="score-block">
        <h2>五教科テスト</h2>

        <div className="row-inline">
          {[schoolYear,grade,term,testType].map((v,i)=>(
            <select
              key={i}
              value={v}
              onChange={e=>{
                const val=e.target.value
                if(i===0) setSchoolYear(val)
                if(i===1) setGrade(val)
                if(i===2) setTerm(val)
                if(i===3) setTestType(val)
              }}
            >
              {(i===0
                ? SCHOOL_YEARS
                : i===1
                ? GRADES
                : i===2
                ? TERMS
                : TEST_TYPES
              ).map(x=>(
                <option key={x}>{x}</option>
              ))}
            </select>
          ))}
        </div>

        <div className="grid">
          {MAIN.map(s=>(
            <div key={s}>
              <label>{s}</label>

              <input
                value={exam[s]}
                inputMode="numeric"
                onChange={e=>
                  setExam({
                    ...exam,
                    [s]:e.target.value.replace(/\D/g,''),
                  })
                }
              />
            </div>
          ))}
        </div>

        <p>5計:{examTotal}点 / 換算:{examConverted}点</p>

        <button onClick={saveExam}>テスト保存</button>
      </div>

      <div className="score-block">
        <h2>内申点</h2>

        <div className="row-inline">
          <select value={schoolYear} onChange={e=>setSchoolYear(e.target.value)}>
            {SCHOOL_YEARS.map(v=><option key={v}>{v}</option>)}
          </select>

          <select value={internalGrade} onChange={e=>setInternalGrade(e.target.value)}>
            {GRADES.map(v=><option key={v}>{v}</option>)}
          </select>

          <select value={internalTerm} onChange={e=>setInternalTerm(e.target.value)}>
            {TERMS.map(v=><option key={v}>{v}</option>)}
          </select>
        </div>

        <div className="grid">
          {MAIN.map(s=>(
            <select
              key={s}
              value={internalMain[s]}
              onChange={e=>
                setInternalMain({
                  ...internalMain,
                  [s]:+e.target.value,
                })
              }
            >
              {[1,2,3,4,5].map(v=>(
                <option key={v} value={v}>
                  {s}:{v}
                </option>
              ))}
            </select>
          ))}
        </div>

        <div className="grid">
          {SUB.map(s=>(
            <select
              key={s}
              value={internalSub[s]}
              onChange={e=>
                setInternalSub({
                  ...internalSub,
                  [s]:+e.target.value,
                })
              }
            >
              {[1,2,3,4,5].map(v=>(
                <option key={v} value={v}>
                  {s}:{v}
                </option>
              ))}
            </select>
          ))}
        </div>

        <p>内申点:{internalTotal}点</p>

        <button onClick={saveInternal}>内申保存</button>
      </div>

      <div className="saved-list">
        <div className="saved-heading">
          <div>
            <span>SCORE ARCHIVE</span>
            <h2>生徒・管理者が入力した成績</h2>
          </div>
          <strong>{saved.length}件</strong>
        </div>

        {!selectedStudentId && <p className="saved-empty">生徒を選択すると、保存された成績の詳細を確認できます。</p>}
        {selectedStudentId && saved.length===0 && <p className="saved-empty">保存された成績はありません。</p>}

        {saved.map(s=>(
          <div key={s.id} className="saved-card">
            <div className="saved-card-head">
              <div>
                <div className="saved-tags">
                  <span className={`score-source ${s.submittedBy === 'admin' || s.approved === true ? 'admin' : 'student'}`}>
                    {s.submittedBy === 'admin' || s.approved === true ? '管理者入力' : '生徒入力'}
                  </span>
                  <span className={`score-kind ${s.type}`}>{s.type==='exam'?'五教科テスト':'内申点'}</span>
                </div>
                <h3>{s.year||'年度不明'}年度　{gradeLabel(s.grade)}　{s.term||'学期不明'}</h3>
                <p>{s.type==='exam'?(s.testType||'テスト種別不明'):'9教科内申'}</p>
              </div>
              <div className="saved-total">
                <small>{s.type==='exam'?'5教科合計':'換算内申点'}</small>
                <strong>{Number(s.type==='exam'?s.examTotal:s.internalTotal)||0}<span>点</span></strong>
              </div>
            </div>

            <details className="score-details">
              <summary>教科別の詳細を見る</summary>
              {s.type==='exam' ? (
                <>
                  <div className="subject-grid exam-subjects">
                    {MAIN.map(subject=><div key={subject}><span>{subject}</span><strong>{s.exam?.[subject]??'-'}<small>点</small></strong></div>)}
                  </div>
                  <div className="score-calculation"><span>志望校判定用の換算点</span><strong>{Number(s.examConverted)||0}点</strong></div>
                </>
              ) : (
                <>
                  <p className="subject-group-label">主要5教科</p>
                  <div className="subject-grid">
                    {MAIN.map(subject=><div key={subject}><span>{subject}</span><strong>{s.internalMain?.[subject]??'-'}</strong></div>)}
                  </div>
                  <p className="subject-group-label">実技4教科</p>
                  <div className="subject-grid sub-subjects">
                    {SUB.map(subject=><div key={subject}><span>{subject}</span><strong>{s.internalSub?.[subject]??'-'}</strong></div>)}
                  </div>
                  <div className="score-calculation"><span>志望校判定用の換算内申点</span><strong>{Number(s.internalTotal)||0}点</strong></div>
                </>
              )}
              <p className="saved-date">登録：{formatSavedAt(s.createdAt)}{s.updatedAt&&`　更新：${formatSavedAt(s.updatedAt)}`}</p>
            </details>

            <div className="saved-actions">
              <button onClick={()=>deleteScore(s.id)} className="delete-btn">この成績を削除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
