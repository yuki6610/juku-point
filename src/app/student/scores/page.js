'use client'
import { useEffect,useState } from 'react'
import { getAuth,onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import { collection,addDoc,onSnapshot,query,orderBy,serverTimestamp,deleteDoc,doc,updateDoc } from 'firebase/firestore'
import './scores.css'
import ScoreBreakdown from '@/components/ScoreBreakdown'

const GRADES = ['中1','中2','中3']
const SCHOOL_YEARS =['2026','2027','2028']
const TERMS=['1学期','2学期','3学期']
const BASE_TEST_TYPES=['中間','期末','春課題実力','夏課題実力','秋課題実力','冬課題実力']
const PAST_EXAMS=['過去問2016','過去問2017','過去問2018','過去問2019','過去問2020','過去問2021','過去問2022','過去問2023','過去問2024','過去問2025']
const MAIN=['国語','社会','数学','理科','英語']
const SUB=['音楽','美術','保体','技家']

export default function StudentScoresPage(){
  const [user,setUser]=useState(null)
  const [checkingAuth,setCheckingAuth]=useState(true)
  const [profile,setProfile]=useState(null)
  const [grade,setGrade]=useState('中1')
  const [term,setTerm]=useState('1学期')
  const [testType,setTestType]=useState('中間')
  const [internalGrade,setInternalGrade]=useState('中1')
  const [internalTerm,setInternalTerm]=useState('1学期')
    const [schoolYear,setSchoolYear] = useState('2026')
  const [exam,setExam]=useState(Object.fromEntries(MAIN.map(s=>[s,''])))
  const [internalMain,setInternalMain]=useState(Object.fromEntries(MAIN.map(s=>[s,3])))
  const [internalSub,setInternalSub]=useState(Object.fromEntries(SUB.map(s=>[s,3])))
  const [saved,setSaved]=useState([])
  const [schools,setSchools]=useState([])
  const [selectedExamId,setSelectedExamId]=useState('')
  const [selectedInternalId,setSelectedInternalId]=useState('')
  const [editingScoreId,setEditingScoreId]=useState(null)

  useEffect(()=>{const auth=getAuth();return onAuthStateChanged(auth,u=>{setUser(u);setCheckingAuth(false)})},[])
  useEffect(()=>{if(!user)return
    const a=onSnapshot(query(collection(db,`users/${user.uid}/scores`),orderBy('createdAt','desc')),s=>setSaved(s.docs.map(d=>({id:d.id,...d.data()}))))
    const b=onSnapshot(collection(db,'schools'),s=>setSchools(s.docs.map(d=>({id:d.id,...d.data()}))))
    const c=onSnapshot(doc(db,'users',user.uid),s=>setProfile(s.data()))
    return()=>{a();b();c()}
  },[user])

  if(checkingAuth) return <p>確認中...</p>
  if(!user) return <p>ログインしてください</p>

  const examTotal=Object.values(exam).reduce((a,b)=>a+Number(b||0),0)
  const examConverted=examTotal*0.5
  const internalTotal=Object.values(internalMain).reduce((a,b)=>a+b,0)*4+Object.values(internalSub).reduce((a,b)=>a+b,0)*7.5
  const selectedExam=saved.find(s=>s.id===selectedExamId)
  const selectedInternal=saved.find(s=>s.id===selectedInternalId)
  const finalTotal=(selectedExam?.examConverted||0)+(selectedInternal?.internalTotal||0)

  const isPastExamStudent=profile?.grade===9 && Array.isArray(profile?.courseTags) && profile.courseTags.includes('past_exam')
  const TEST_TYPES=isPastExamStudent && year==='中3' ? [...BASE_TEST_TYPES,...PAST_EXAMS] : BASE_TEST_TYPES

  const judgeResult=(my,min)=>{const d=my-min
    if(d>=20)return{diff:d,label:'◎ 安全圏',className:'safe'}
    if(d>=0)return{diff:d,label:'○ 合格圏',className:'ok'}
    if(d>=-20)return{diff:d,label:'△ 努力圏',className:'warn'}
    return{diff:d,label:'× 厳しい',className:'ng'}
  }

  const isDuplicateExam=()=>saved.some(s=>
    s.type==='exam' && s.year===year && s.term===term && s.testType===testType && s.id!==editingScoreId
  )
  const isDuplicateInternal=()=>saved.some(s=>
    s.type==='internal' && s.year===internalYear && s.term===internalTerm && s.id!==editingScoreId
  )

    const saveExam = async () => {
      if (!confirm('この内容でテスト成績を保存しますか？')) return
      if (isDuplicateExam()) {
        alert('同じ学年・学期・テストの成績が既にあります')
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
        approved: false,
        updatedAt: serverTimestamp(),
      }

      editingScoreId
        ? await updateDoc(
            doc(db, `users/${user.uid}/scores/${editingScoreId}`),
            data
          )
        : await addDoc(
            collection(db, `users/${user.uid}/scores`),
            { ...data, createdAt: serverTimestamp() }
          )

      setEditingScoreId(null)
    }
    const saveInternal = async () => {
      if (!confirm('この内容で内申点を保存しますか？')) return
      if (isDuplicateInternal()) {
        alert('同じ学年・学期の内申点が既にあります')
        return
      }

      const data = {
        type: 'internal',
        year: schoolYear,
        term: internalTerm,
        internalMain,
        internalSub,
        internalTotal,
        approved: false,
        updatedAt: serverTimestamp(),
      }

      editingScoreId
        ? await updateDoc(
            doc(db, `users/${user.uid}/scores/${editingScoreId}`),
            data
          )
        : await addDoc(
            collection(db, `users/${user.uid}/scores`),
            { ...data, createdAt: serverTimestamp() }
          )

      setEditingScoreId(null)
    }
  return (
    <div className="page">
      <h1>成績入力・志望校判定</h1>

      <div className="score-input-wrapper">
        <div className="score-block">
          <h2>五教科テスト</h2>
          <div className="row-inline">
            <select value={grade} onChange={e=>setGrade(e.target.value)}>{GRADES.map(v=><option key={v}>{v}</option>)}</select>
            <select value={term} onChange={e=>setTerm(e.target.value)}>{TERMS.map(v=><option key={v}>{v}</option>)}</select>
            <select value={testType} onChange={e=>setTestType(e.target.value)}>{TEST_TYPES.map(v=><option key={v}>{v}</option>)}</select>
          </div>
          <div className="grid">{MAIN.map(s=>(
            <div key={s}><label>{s}</label>
              <input value={exam[s]} inputMode="numeric" onChange={e=>setExam({...exam,[s]:e.target.value.replace(/\D/g,'')})}/>
            </div>))}</div>
          <p>5計:{examTotal}点 / 入試換算点:{examConverted}点</p>
          <button onClick={saveExam}>テストを保存</button>
        </div>

        <div className="score-block internal-block">
          <h2>内申点</h2>
          <div className="row-inline">
            <select value={internalGrade} onChange={e=>setInternalGrade(e.target.value)}>{GRADES.map(v=><option key={v}>{v}</option>)}</select>
            <select value={internalTerm} onChange={e=>setInternalTerm(e.target.value)}>{TERMS.map(v=><option key={v}>{v}</option>)}</select>
          </div>
          <div className="grid">{MAIN.map(s=>(
            <select key={s} value={internalMain[s]} onChange={e=>setInternalMain({...internalMain,[s]:+e.target.value})}>
              {[1,2,3,4,5].map(v=><option key={v} value={v}>{s}:{v}</option>)}
            </select>))}</div>
          <div className="grid">{SUB.map(s=>(
            <select key={s} value={internalSub[s]} onChange={e=>setInternalSub({...internalSub,[s]:+e.target.value})}>
              {[1,2,3,4,5].map(v=><option key={v} value={v}>{s}:{v}</option>)}
            </select>))}</div>
          <p>内申点:{internalTotal}点</p>
          <button onClick={saveInternal}>内申を保存</button>
        </div>
      </div>

      <h2>志望校判定に使う成績</h2>
      <div className="row">
        <select value={selectedExamId} onChange={e=>setSelectedExamId(e.target.value)}>
          <option value="">テストを選択</option>
          {saved.filter(s=>s.type==='exam').map(s=>
            <option key={s.id} value={s.id}>{s.year} {s.term} {s.testType}｜5計{s.examTotal}点 / 換算{s.examConverted}点</option>
          )}
        </select>
        <select value={selectedInternalId} onChange={e=>setSelectedInternalId(e.target.value)}>
          <option value="">内申点を選択</option>
          {saved.filter(s=>s.type==='internal').map(s=>
            <option key={s.id} value={s.id}>{s.year} {s.term}｜内申{s.internalTotal}点</option>
          )}
        </select>
      </div>

      <ScoreBreakdown exam={selectedExam} internal={selectedInternal} />

      <h2>志望校比較</h2>
      <table className="compare-table">
        <thead><tr><th>高校名</th><th>最低点</th><th>あなた</th><th>差</th><th>判定</th></tr></thead>
        <tbody>{[...schools].sort((a,b)=>b.minScore-a.minScore).map(s=>{
          const r=judgeResult(finalTotal,s.minScore)
          return (
            <tr key={s.id}>
              <td>{s.name}</td><td>{s.minScore}</td><td>{finalTotal}</td>
              <td className={r.className}>{r.diff>=0?`+${r.diff}`:r.diff}</td>
              <td className={r.className}>{r.label}</td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}
