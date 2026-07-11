'use client'
import { useEffect,useState } from 'react'
import { getAuth,onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,
  doc,
  getDoc,
  getDocs,
    setDoc,
  onSnapshot
} from 'firebase/firestore'
import './judge.css'

import ScoreBreakdown from '@/components/ScoreBreakdown'
import BehaviorSummary from '@/components/BehaviorSummary'

/* =====================
   定数
===================== */
const GRADE_OPTIONS = ['全学年','中1','中2','中3']
const TERMS = ['1学期','2学期','3学期']
const YEARS = ['2026','2027','2028']

const gradeLabel = g => g>=7 && g<=9 ? `中${g-6}` : '不明'

const studentName = student => student?.realName || student?.displayName || '名前未設定'

const todayLabel = () => new Date().toLocaleDateString('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})

const judgeResult = (my,min)=>{
  const d=my-min
  if(d>=20) return{diff:d,label:'◎ 安全圏',className:'safe'}
  if(d>=0)  return{diff:d,label:'○ 合格圏',className:'ok'}
  if(d>=-20)return{diff:d,label:'△ 努力圏',className:'warn'}
  return{diff:d,label:'× 危険',className:'ng'}
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
    const [comment,setComment] = useState('')
   

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
    getDocs(collection(db,'users')).then(snap=>{
      setStudents(
        snap.docs
          .map(d=>({uid:d.id,...d.data()}))
          .filter(s=>Number(s.grade)>=7&&Number(s.grade)<=9)
          .sort((a,b)=>
            Number(a.grade||0)-Number(b.grade||0) ||
            String(a.realName||a.displayName||'').localeCompare(String(b.realName||b.displayName||''),'ja')
          )
      )
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
    getDocs(collection(db,'schools')).then(
      snap=>setSchools(snap.docs.map(d=>({id:d.id,...d.data()})))
    )
  },[])
    
    useEffect(()=>{
      if(!selectedStudentId) return

      const loadComment = async ()=>{
        const snap = await getDoc(
          doc(
            db,
            'users',
            selectedStudentId,
            'judgeComments',
            `${year}_${term}`
          )
        )

        if(snap.exists()){
          setComment(snap.data().comment || '')
        }else{
          setComment('')
        }
      }

      loadComment()
    },[selectedStudentId,year,term])
    
  if(loading) return <p>読み込み中...</p>
  if(!admin) return <p>管理者ログインが必要です</p>

  const filteredStudents = students.filter(s=>{
    if(Number(s.grade)<7 || Number(s.grade)>9) return false
    if(gradeFilter==='全学年') return true
    return gradeLabel(s.grade)===gradeFilter
  })

  const myTotal =
    (examScore?.examConverted||0) +
    (internalScore?.internalTotal||0)
      
      const saveComment = async ()=>{
        if(!selectedStudentId) return

        await setDoc(
          doc(
            db,
            'users',
            selectedStudentId,
            'judgeComments',
            `${year}_${term}`
          ),
          {
            comment,
            updatedAt:new Date()
          }
        )

        alert('コメントを保存しました')
      }

  const sortedSchools=[...schools].sort((a,b)=>b.minScore-a.minScore)
  const schoolResults = sortedSchools.map(s => {
    const result = judgeResult(myTotal, Number(s.minScore || 0))
    const internalDiff = (internalScore?.internalTotal ?? 0) - (s.internalTarget ?? 0)
    const averageDiff = myTotal - (s.averageScore ?? 0)
    const examDiff = (examScore?.examTotal ?? 0) - (s.scoreTarget ?? 0)
    return { ...s, result, internalDiff, averageDiff, examDiff }
  })
  const bestResult = schoolResults.find(s => s.result.diff >= 0) || schoolResults[0]
  const examLabel = examScore
    ? `${gradeLabel(examScore.grade)} ${examScore.term} ${examScore.testType}｜5計${examScore.examTotal}点 / 換算${examScore.examConverted}点`
    : '未選択'
  const internalLabel = internalScore
    ? `${gradeLabel(internalScore.grade)} ${internalScore.term}｜内申${internalScore.internalTotal}点`
    : '未選択'

    return (
      <div className="page judge-page">
        <section className="judge-control-panel no-print">
          <div>
            <span>JUDGEMENT REPORT</span>
            <h1>志望校判定レポート作成</h1>
            <p>生徒・学期・使用する成績を選ぶと、印刷用の判定帳票を作成できます。</p>
          </div>
          <button className="print-btn" onClick={() => window.print()}>印刷する</button>
        </section>

        <div className="judge-filters no-print">
          <label>学年<select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}>
            {GRADE_OPTIONS.map(g=><option key={g}>{g}</option>)}
          </select></label>

          <label>年度<select value={year} onChange={e=>setYear(e.target.value)}>
            {YEARS.map(y=><option key={y} value={y}>{y}年</option>)}
          </select></label>

          <label>学期<select value={term} onChange={e=>setTerm(e.target.value)}>
            {TERMS.map(t=><option key={t}>{t}</option>)}
          </select></label>

          <label>生徒<select value={selectedStudentId} onChange={e=>setSelectedStudentId(e.target.value)}>
            <option value="">生徒を選択</option>
            {filteredStudents.map(s=>
              <option key={s.uid} value={s.uid}>{studentName(s)}</option>
            )}
          </select></label>
        </div>

        {selectedStudent && (
          <>
            <div className="score-select no-print">
              <label>使用するテスト<select value={examScore?.id||''} onChange={e=>setExamScore(scores.find(s=>s.id===e.target.value))}>
                <option value="">テスト</option>
                {scores.filter(s=>s.type==='exam').map(s=>
                  <option key={s.id} value={s.id}>
                    {gradeLabel(s.grade)} {s.term}{s.testType} 5計{s.examTotal}点 入試換算{s.examConverted}点
                  </option>
                )}
              </select></label>

              <label>使用する内申<select value={internalScore?.id||''} onChange={e=>setInternalScore(scores.find(s=>s.id===e.target.value))}>
                <option value="">内申</option>
                {scores.filter(s=>s.type==='internal').map(s=>
                  <option key={s.id} value={s.id}>
                    {gradeLabel(s.grade)} {s.term} 内申{s.internalTotal}点
                  </option>
                )}
              </select></label>
            </div>

            <section className="report-sheet">
              <header className="report-header">
                <div>
                  <span>WAM PERSONAL REPORT</span>
                  <h1>{studentName(selectedStudent)} さん 志望校判定</h1>
                  <p>{year}年度 {term}　作成日：{todayLabel()}</p>
                </div>
                <div className="report-grade">{gradeLabel(selectedStudent.grade)}</div>
              </header>

              <section className="report-summary-grid">
                <article>
                  <span>総合点</span>
                  <strong>{myTotal}</strong>
                  <small>入試換算 + 内申</small>
                </article>
                <article>
                  <span>五教科</span>
                  <strong>{examScore?.examTotal ?? '-'}</strong>
                  <small>入試換算 {examScore?.examConverted ?? '-'}</small>
                </article>
                <article>
                  <span>内申</span>
                  <strong>{internalScore?.internalTotal ?? '-'}</strong>
                  <small>9教科合計</small>
                </article>
              </section>

              <section className="selected-score-box">
                <div><span>使用テスト</span><strong>{examLabel}</strong></div>
                <div><span>使用内申</span><strong>{internalLabel}</strong></div>
                <div><span>目安</span><strong>{bestResult ? `${bestResult.name}：${bestResult.result.label}` : '高校データなし'}</strong></div>
              </section>

              <ScoreBreakdown exam={examScore} internal={internalScore} />

              <BehaviorSummary uid={selectedStudent.uid} year={year} term={term} />

              <section className="detail-table-section">
                <div className="detail-heading">
                  <div>
                    <h2>全校 詳細比較</h2>
                    <p>各欄は「本人 / 高校基準」と、その差を表示</p>
                  </div>
                  <strong>{schoolResults.length}校</strong>
                </div>
                <table className="compare-table">
                  <thead>
                                 <tr>
                                   <th>高校</th>
                                   <th>最低点<br/><small>本人 / 基準｜差</small></th>
                                   <th>平均点<br/><small>本人 / 基準｜差</small></th>
                                   <th>内申<br/><small>本人 / 目安｜差</small></th>
                                   <th>5教科<br/><small>本人 / 目安｜差</small></th>
                                   <th>判定</th>
                                 </tr>
                  </thead>

                                 <tbody>
                                   {schoolResults.map((s) => (
                                       <tr key={s.id}>
                                         <td>
                                           <div className="school-name">{s.name}</div>
                                           <div className="school-deviation">
                                             偏差値 {s.deviation ?? "-"}
                                           </div>
                                         </td>

                                         <td><span>{myTotal} / {s.minScore ?? "-"}</span><strong className={s.result.className}>{s.result.diff >= 0 ? `+${s.result.diff}` : s.result.diff}</strong></td>
                                         <td><span>{myTotal} / {s.averageScore ?? "-"}</span><strong className={s.averageDiff >= 0 ? "safe" : "ng"}>{s.averageDiff >= 0 ? `+${s.averageDiff}` : s.averageDiff}</strong></td>
                                         <td><span>{internalScore?.internalTotal ?? "-"} / {s.internalTarget ?? "-"}</span><strong className={s.internalDiff >= 0 ? "safe" : "ng"}>{s.internalDiff >= 0 ? `+${s.internalDiff}` : s.internalDiff}</strong></td>
                                         <td><span>{examScore?.examTotal ?? "-"} / {s.scoreTarget ?? "-"}</span><strong className={s.examDiff >= 0 ? "safe" : "ng"}>{s.examDiff >= 0 ? `+${s.examDiff}` : s.examDiff}</strong></td>

                                         <td className={s.result.className}>{s.result.label}</td>
                                       </tr>
                                   ))}
                                 </tbody>
                </table>
              </section>

              <section className="print-comment">
                <h3>コメント</h3>
                <p style={{whiteSpace:'pre-wrap'}}>
                  {comment || 'コメントなし'}
                </p>
              </section>
            </section>

            <div className="comment-box no-print">
              <div>
                <h3>印刷用コメント</h3>
                <p>面談で伝える内容や次回までの課題を書いてください。</p>
              </div>
              <textarea
                value={comment}
                onChange={e=>setComment(e.target.value)}
                placeholder="コメントを入力"
                rows={8}
              />

              <button
                className="save-comment-btn no-print"
                onClick={saveComment}
              >
                コメント保存
              </button>
            </div>
          </>
        )}
      </div>
    
          
         
  )
}
