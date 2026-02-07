'use client'
import { useEffect,useState } from 'react'
import { getAuth,onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,doc,onSnapshot,addDoc,updateDoc,setDoc,
  serverTimestamp,increment
} from 'firebase/firestore'
import './behavior.css'

const GRADE_OPTIONS=['全学年','中1','中2','中3']
const HOMEWORK_OPTIONS=[{value:'submitted',label:'提出'},{value:'partial',label:'途中'},{value:'missed',label:'忘れ'}]
const ATTENDANCE_OPTIONS=[{value:'ontime',label:'時間通り'},{value:'late',label:'遅刻'}]
const gradeLabel=g=>g>=7&&g<=9?`中${g-6}`:'不明'

export default function AdminBehaviorPage(){
  const [admin,setAdmin]=useState(null)
  const [loading,setLoading]=useState(true)
  const [students,setStudents]=useState([])
  const [gradeFilter,setGradeFilter]=useState('全学年')
  const [selectedStudent,setSelectedStudent]=useState(null)
  const [date,setDate]=useState('')
  const [homework,setHomework]=useState('submitted')
  const [attendance,setAttendance]=useState('ontime')
  const [forgot,setForgot]=useState(false)
  const [forgotItems,setForgotItems]=useState('')

  useEffect(()=>{const a=getAuth();return onAuthStateChanged(a,u=>{setAdmin(u);setLoading(false)})},[])
  useEffect(()=>{if(!admin)return
    return onSnapshot(collection(db,'users'),s=>{
      setStudents(s.docs.map(d=>({uid:d.id,...d.data()})))
    })
  },[admin])

  if(loading) return <p>読み込み中...</p>
  if(!admin) return <p>管理者ログインが必要です</p>

  const filteredStudents=students.filter(s=>gradeFilter==='全学年'||gradeLabel(s.grade)===gradeFilter)

  const saveBehavior=async()=>{
    if(!date) return alert('日付を選択してください')
    if(!selectedStudent) return
    if(!confirm(`${selectedStudent.realName} の生活態度を記録しますか？`)) return

    const logRef=collection(db,`users/${selectedStudent.uid}/behaviorLogs`)
    const summaryRef=doc(db,`users/${selectedStudent.uid}/behavior/summary`)

    await addDoc(logRef,{
      date,homework,attendance,forgot,
      forgotItems:forgot?forgotItems.split(',').map(v=>v.trim()):[],
      createdAt:serverTimestamp(),recordedBy:admin.uid
    })

    try{
      await updateDoc(summaryRef,{
        [`homework.${homework}`]:increment(1),
        [`attendance.${attendance}`]:increment(1),
        forgot:forgot?increment(1):increment(0),
        updatedAt:serverTimestamp()
      })
    }catch{
      await setDoc(summaryRef,{
        homework:{
          submitted:homework==='submitted'?1:0,
          partial:homework==='partial'?1:0,
          missed:homework==='missed'?1:0
        },
        attendance:{
          ontime:attendance==='ontime'?1:0,
          late:attendance==='late'?1:0
        },
        forgot:forgot?1:0,
        updatedAt:serverTimestamp()
      })
    }

    alert('記録しました')
    setDate('');setForgot(false);setForgotItems('')
  }

  return (
    <div className="page behavior-page">
      <h1>管理者：生活態度記録</h1>

      <div className="row">
        <select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}>
          {GRADE_OPTIONS.map(g=><option key={g}>{g}</option>)}
        </select>
      </div>

      <div className="student-list">
        {filteredStudents.map(s=>(
          <div key={s.uid}
            className={`student-card ${selectedStudent?.uid===s.uid?'active':''}`}
            onClick={()=>setSelectedStudent(s)}>
            <div className="name">{s.realName}</div>
            <div className="grade">{gradeLabel(s.grade)}</div>
          </div>
        ))}
      </div>

      {selectedStudent&&(
        <div className="record-card">
          <h2>{selectedStudent.realName} の生活態度</h2>

          <label>日付</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} />

          <label>宿題</label>
          <select value={homework} onChange={e=>setHomework(e.target.value)}>
            {HOMEWORK_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label>遅刻</label>
          <select value={attendance} onChange={e=>setAttendance(e.target.value)}>
            {ATTENDANCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label>
            <input type="checkbox" checked={forgot} onChange={e=>setForgot(e.target.checked)} />
            忘れ物あり
          </label>

          {forgot&&(
            <input placeholder="例：筆記用具, ワーク"
              value={forgotItems} onChange={e=>setForgotItems(e.target.value)} />
          )}

          <button onClick={saveBehavior}>記録する</button>
        </div>
      )}
    </div>
  )
}
