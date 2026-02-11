'use client'
import { useEffect,useState } from 'react'
import { getAuth,onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot
} from 'firebase/firestore'
import './judge.css'

import ScoreBreakdown from '@/components/ScoreBreakdown'
import BehaviorSummary from '@/components/BehaviorSummary'
import FinalCorrelationChart from '@/components/FinalCorrelationChart'

/* =====================
   定数
===================== */
const GRADE_OPTIONS = ['全学年','中1','中2','中3']
const TERMS = ['1学期','2学期','3学期']
const YEARS = ['2024','2025','2026']

const gradeLabel = g => g>=7 && g<=9 ? `中${g-6}` : '不明'

const judgeResult = (my,min)=>{
  const d=my-min
  if(d>=20) return{diff:d,label:'◎ 安全圏',className:'safe'}
  if(d>=0)  return{diff:d,label:'○ 合格圏',className:'ok'}
  if(d>=-20)return{diff:d,label:'△ 努力圏',className:'warn'}
  return{diff:d,label:'× 厳しい',className:'ng'}
}

export default function AdminJudgePage(){
  const [admin,setAdmin]=useState(null)
  const [loading,setLoading]=useState(true)

  const [students,setStudents]=useState([])
  const [gradeFilter,setGradeFilter]=useState('全学年')
  const [selectedStudentId,setSelectedStudentId]=useState('')
  const [selectedStudent,setSelectedStudent]=useState(null)

  const [year,setYear]=useState('2026')
  const [term,setTerm]=useState('1学期')

  const [scores,setScores]=useState([])
  const [examScore,setExamScore]=useState(null)
  const [internalScore,setInternalScore]=useState(null)

  const [schools,setSchools]=useState([])
  const [correlationPoints,setCorrelationPoints]=useState([])

  /* === 認証 === */
  useEffect(()=>{
    return onAuthStateChanged(getAuth(),u=>{
      setAdmin(u)
      setLoading(false)
    })
  },[])

  /* === 生徒一覧 === */
  useEffect(()=>{
    if(!admin) return
    return onSnapshot(collection(db,'users'),snap=>{
      setStudents(snap.docs.map(d=>({uid:d.id,...d.data()})))
    })
  },[admin])

  /* === 選択生徒 === */
  useEffect(()=>{
    if(!selectedStudentId){
      setSelectedStudent(null)
      return
    }

    setSelectedStudent(students.find(s=>s.uid===selectedStudentId))

    return onSnapshot(
      collection(db, `users/${selectedStudentId}/scores`),
      snap=>setScores(snap.docs.map(d=>({id:d.id,...d.data()})))
    )
  },[selectedStudentId,students])

  /* === 高校 === */
  useEffect(()=>{
    return onSnapshot(collection(db,'schools'),
      snap=>setSchools(snap.docs.map(d=>({id:d.id,...d.data()})))
    )
  },[])

    /* =====================
       相関データ生成（最終・安定版）
    ===================== */
    useEffect(() => {
      if (students.length === 0) return

      const build = async () => {
        const arr = []

        for (const s of students) {
          /* 生活態度（確定値） */
          const behRef = doc(
            db,
            'users',
            s.uid,
            'behaviorSummary',
            `${year}_${term}`
          )
          const behSnap = await getDoc(behRef)
          if (!behSnap.exists()) continue

          const behavior = behSnap.data().behaviorScore
          if (behavior === undefined) continue

          /* 成績（同学期 examTotal 最大） */
          const scoreSnap = await getDocs(
            collection(db, 'users', s.uid, 'scores')
          )

          const sameTerm = scoreSnap.docs
            .map(d => d.data())
            .filter(sc =>
              sc.year === year &&
              sc.term === term &&
              typeof sc.examTotal === 'number'
            )

          if (sameTerm.length === 0) continue

          const best = Math.max(...sameTerm.map(s => s.examTotal))

          arr.push({
            uid: s.uid,
            behavior,
            score: best,
          })
        }

        setCorrelationPoints(arr)
      }

      build()
    }, [students, year, term])
    
  if(loading) return <p>読み込み中...</p>
  if(!admin) return <p>管理者ログインが必要です</p>

  const filteredStudents = students.filter(s=>{
    if(gradeFilter==='全学年') return true
    return gradeLabel(s.grade)===gradeFilter
  })

  const myTotal =
    (examScore?.examConverted||0) +
    (internalScore?.internalTotal||0)

  const sortedSchools=[...schools].sort((a,b)=>b.minScore-a.minScore)

  return (
    <div className="page judge-page">
      <h1>管理者：志望校判定</h1>

      <div className="row no-print">
        <select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}>
          {GRADE_OPTIONS.map(g=><option key={g}>{g}</option>)}
        </select>

        <select value={year} onChange={e=>setYear(e.target.value)}>
          {YEARS.map(y=><option key={y} value={y}>{y}年</option>)}
        </select>

        <select value={term} onChange={e=>setTerm(e.target.value)}>
          {TERMS.map(t=><option key={t}>{t}</option>)}
        </select>

        <select value={selectedStudentId} onChange={e=>setSelectedStudentId(e.target.value)}>
          <option value="">生徒を選択</option>
          {filteredStudents.map(s=>
            <option key={s.uid} value={s.uid}>{s.realName}</option>
          )}
        </select>
      </div>

      {selectedStudent && (
        <>
          {/* 円グラフ（summary 直読み） */}
          <BehaviorSummary
            uid={selectedStudent.uid}
            year={year}
            term={term}
          />

          {/* 相関図 */}
          <FinalCorrelationChart
            points={correlationPoints}
            meUid={selectedStudent.uid}
          />

          {/* 成績選択（既存） */}
          <div className="score-select no-print">
            <select value={examScore?.id||''}
              onChange={e=>setExamScore(scores.find(s=>s.id===e.target.value))}>
              <option value="">テスト</option>
              {scores.filter(s=>s.type==='exam').map(s=>
                <option key={s.id} value={s.id}>
                  {s.year}{s.term}{s.testType} 換算{s.examConverted}
                </option>
              )}
            </select>

            <select value={internalScore?.id||''}
              onChange={e=>setInternalScore(scores.find(s=>s.id===e.target.value))}>
              <option value="">内申</option>
              {scores.filter(s=>s.type==='internal').map(s=>
                <option key={s.id} value={s.id}>
                  {s.year}{s.term} 内申{s.internalTotal}
                </option>
              )}
            </select>
          </div>

          <ScoreBreakdown exam={examScore} internal={internalScore} />

          <table className="compare-table">
            <thead>
              <tr>
                <th>高校</th><th>最低点</th><th>あなた</th><th>差</th><th>判定</th>
              </tr>
            </thead>
            <tbody>
              {sortedSchools.map(s=>{
                const r=judgeResult(myTotal,s.minScore)
                return(
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.minScore}</td>
                    <td>{myTotal}</td>
                    <td className={r.className}>{r.diff}</td>
                    <td className={r.className}>{r.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
          
          <button className="print-btn no-print" onClick={() => window.print()}>
            印刷
          </button>
    </div>
  )
}

