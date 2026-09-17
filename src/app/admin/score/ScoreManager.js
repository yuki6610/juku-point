'use client'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { useAcademicContext } from '@/lib/useAcademicContext'

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
import { BASE_TEST_TYPES, PAST_EXAMS, SUMMER_ENTRANCE_PRACTICE } from '@/lib/scoreSubmissionPlan.mjs'

const GRADES=['中1','中2','中3']
const TERMS=['1学期','2学期','3学期']

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

export default function ScoreManager() {
  const edits=useUnsavedChanges('.admin-score-page');
  const [saving,setSaving]=useState(false),[saveNotice,setSaveNotice]=useState('')
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
  const [schoolYear,setSchoolYear]=useState('')
  const academic = useAcademicContext()
  const SCHOOL_YEARS = [...new Set([...academic.settings.map(item => String(item.year)), ...saved.map(item => String(item.year)), schoolYear].filter(Boolean))].sort()
  useEffect(() => {
    if (!academic.current) return
    setSchoolYear(String(academic.current.year))
    setTerm(`${academic.current.term}学期`)
    setInternalTerm(`${academic.current.term}学期`)
  }, [academic.current])

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
          .filter(s=>s.active!==false&&s.enrollmentStatus!=='withdrawn'&&Number(s.grade)>=7&&Number(s.grade)<=9)
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

    setSaved([])
    setExam(Object.fromEntries(MAIN.map(subject=>[subject,''])))
    setEditingScoreId(null)
    const selected=students.find(item=>item.uid===selectedStudentId)
    if(selected){setGrade(`中${Number(selected.grade)-6}`);setInternalGrade(`中${Number(selected.grade)-6}`)}
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

  const TEST_TYPES=selectedStudent?.grade===9&&grade==='中3'
    ? [
        ...BASE_TEST_TYPES,
        ...(selectedStudent?.courseTags?.includes('summer_course')?SUMMER_ENTRANCE_PRACTICE:[]),
        ...(selectedStudent?.courseTags?.includes('past_exam')?PAST_EXAMS:[]),
      ]
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
    if(saving)return
    if(editingScoreId&&saved.find(item=>item.id===editingScoreId)?.type!=='exam')return alert('編集中の成績と同じ種類の保存ボタンを使ってください。')
    setSaving(true);setSaveNotice('');try{
    if(!selectedStudentId) return alert('生徒を選択してください')
    if(Object.values(exam).some(value=>String(value).trim()===''||!Number.isInteger(Number(value))||Number(value)<0||Number(value)>100))return alert('全教科を0〜100の整数で入力してください')
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
    edits.markSaved()
    }catch(error){setSaveNotice(error.message||'保存できませんでした。再度お試しください。')}finally{setSaving(false)}
  }

  const saveInternal=async()=>{
    if(saving)return
    if(editingScoreId&&saved.find(item=>item.id===editingScoreId)?.type!=='internal')return alert('編集中の成績と同じ種類の保存ボタンを使ってください。')
    setSaving(true);setSaveNotice('');try{
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
    edits.markSaved()
    }catch(error){setSaveNotice(error.message||'保存できませんでした。再度お試しください。')}finally{setSaving(false)}
  }

  const deleteScore=async(scoreId)=>{
    if(!selectedStudentId) return
    if(!confirm('このデータを削除しますか？')) return

    await deleteDoc(
      doc(db,`users/${selectedStudentId}/scores/${scoreId}`)
    )

    alert('削除しました')
  }

  if (academic.loading) return <p>年度・学期を確認中です…</p>
  if (academic.error) return <p role="alert">{academic.error} <a href="/admin/settings">授業設定を確認</a></p>
  return (
    <div className="admin-score-page"><fieldset disabled={saving} style={{border:0,padding:0,minWidth:0}}>{saveNotice&&<p role="alert">{saveNotice}</p>}{editingScoreId&&<p>既存の成績を編集中です。<button onClick={()=>setEditingScoreId(null)}>編集を終了</button></p>}
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
                    {s.submittedBy === 'admin' || s.approved === true ? '管理者入力' : s.submittedBy === 'parent' ? '保護者入力' : '生徒入力'}
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
              <button onClick={()=>{setEditingScoreId(s.id);setSchoolYear(String(s.year));if(s.type==='exam'){setExam(s.exam);setTerm(s.term);setGrade(gradeLabel(s.grade));setTestType(s.testType)}else{setInternalMain(s.internalMain);setInternalSub(s.internalSub);setInternalTerm(s.term);setInternalGrade(gradeLabel(s.grade))}window.scrollTo({top:0,behavior:'smooth'})}}>この成績を編集</button>
              <button onClick={()=>deleteScore(s.id)} className="delete-btn">この成績を削除</button>
            </div>
          </div>
        ))}
      </div>
    </fieldset></div>
  )
}
