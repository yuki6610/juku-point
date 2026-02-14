'use client'
import { useEffect,useMemo,useState } from 'react'
import { collection,getDocs,getDoc,addDoc,deleteDoc,doc,query,orderBy,updateDoc } from 'firebase/firestore'
import { db } from '@/firebaseConfig'
import { getAuth,onAuthStateChanged } from 'firebase/auth'
import './universities.css'

export default function UniversitiesPage(){

/* ================= 基本状態 ================= */
const auth = getAuth()
const [universities,setUniversities] = useState([])
const [loading,setLoading] = useState(true)
const [selectedUniversity,setSelectedUniversity] = useState(null)
const [admissions,setAdmissions] = useState([])
const [wishlists,setWishlists] = useState([])
const [wishlistDetails,setWishlistDetails] = useState([])
const [calendar,setCalendar] = useState([])
const [user,setUser] = useState(null)

const [editTarget,setEditTarget] = useState(null)
const [editFaculty,setEditFaculty] = useState('')
const [editDepartment,setEditDepartment] = useState('')
const [editSubjects,setEditSubjects] = useState('')
const [editMemo,setEditMemo] = useState('')

/* ================= フィルタ ================= */
const [keyword,setKeyword] = useState('')
const [selectedPref,setSelectedPref] = useState('')
const [selectedType,setSelectedType] = useState('')
const [selectedFaculty,setSelectedFaculty] = useState('')
const [selectedDept,setSelectedDept] = useState('')
const [selectedSubject,setSelectedSubject] = useState('')

/* ================= カレンダー入力 ================= */
const [calTitle,setCalTitle] = useState('')
const [calDate,setCalDate] = useState('')
const [calTime,setCalTime] = useState('')
const [countdown,setCountdown] = useState(null)

const [today] = useState(new Date())
const [currentMonth,setCurrentMonth] = useState(new Date())

/* ================= 認証監視 ================= */
useEffect(()=>{
  const unsub = onAuthStateChanged(auth,(u)=>{
    setUser(u)
    if(u){ loadWishlists(u.uid); loadCalendar(u.uid) }
  })
  return ()=>unsub()
},[])

/* ================= 初期ロード ================= */
useEffect(()=>{ loadUniversities(); calcCountdown() },[])

/* ================= 共通テスト計算 ================= */
function getThirdSaturday(year){
  const d = new Date(year,0,1)
  const firstSat = 1 + (6 - d.getDay() + 7) % 7
  return new Date(year,0,firstSat + 14)
}
function calcCountdown(){
  const now = new Date()
  let year = now.getFullYear()
  let target = getThirdSaturday(year)
  if(now > target) target = getThirdSaturday(year + 1)
  const diff = Math.ceil((target - now)/(1000*60*60*24))
  setCountdown(diff)
}

/* ================= 都道府県順 ================= */
const PREF_ORDER = [
"北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
"茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
"新潟県","富山県","石川県","福井県","山梨県","長野県",
"岐阜県","静岡県","愛知県","三重県",
"滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
"鳥取県","島根県","岡山県","広島県","山口県",
"徳島県","香川県","愛媛県","高知県",
"福岡県","佐賀県","長崎県","熊本県","大分県",
"宮崎県","鹿児島県","沖縄県"
]

const prefectures = useMemo(()=>{
  const set = new Set(universities.map(u=>u.prefecture).filter(Boolean))
  return PREF_ORDER.filter(p=>set.has(p))
},[universities])

/* ================= 学部 ================= */
const faculties = useMemo(()=>{
  const set = new Set()
  universities.forEach(u=>u.searchIndex?.faculties?.forEach(f=>set.add(f)))
  return [...set].sort()
},[universities])

/* ================= 学科 ================= */
const departments = useMemo(()=>{
  const set = new Set()
  universities.forEach(u=>{
    if(!selectedFaculty || u.searchIndex?.faculties?.includes(selectedFaculty)){
      u.searchIndex?.departments?.forEach(d=>set.add(d))
    }
  })
  return [...set].sort()
},[universities,selectedFaculty])

/* ================= 科目 ================= */
const subjects = useMemo(()=>{
  const set = new Set()
  universities.forEach(u=>u.searchIndex?.subjects?.forEach(s=>set.add(s)))
  return [...set].sort()
},[universities])
    
    /* ================= フィルタ判定 ================= */
    const hasFilter =
      keyword || selectedPref || selectedType ||
      selectedFaculty || selectedDept || selectedSubject

    /* ================= フィルタ結果 ================= */
    const filtered = universities.filter(u=>{
      if(!hasFilter) return false
      if(keyword && !u.name?.toLowerCase().includes(keyword.toLowerCase())) return false
      if(selectedPref && u.prefecture!==selectedPref) return false
      if(selectedType && u.establishedType!==selectedType) return false
      if(selectedFaculty && !u.searchIndex?.faculties?.includes(selectedFaculty)) return false
      if(selectedDept && !u.searchIndex?.departments?.includes(selectedDept)) return false
      if(selectedSubject && !u.searchIndex?.subjects?.includes(selectedSubject)) return false
      return true
    })

    /* ================= Firestore取得 ================= */
    async function loadUniversities(){
      const s = await getDocs(collection(db,'universities'))
      setUniversities(s.docs.map(d=>({ id:d.id,...d.data() })))
      setLoading(false)
    }

    async function loadWishlists(uid){
      const s = await getDocs(query(collection(db,'users',uid,'wishlists'),orderBy('order','asc')))
      setWishlists(s.docs.map(d=>({ id:d.id,...d.data() })))
    }

    async function loadCalendar(uid){
      const s = await getDocs(query(collection(db,'users',uid,'calendar'),orderBy('date','asc')))
      setCalendar(s.docs.map(d=>({ id:d.id,...d.data() })))
    }

    async function loadAdmissions(id){
      const s = await getDocs(collection(db,'universities',id,'admissions'))
      setAdmissions(s.docs.map(d=>({ id:d.id,...d.data() })))
    }

    /* ================= 志望校 ================= */
    async function addWishlist(adm){
      if(!user) return alert('ログインしてください')
      if(wishlists.length>=5) return alert('最大5件')
      if(wishlists.find(w=>w.admissionId===adm.id)) return alert('登録済み')

      await addDoc(collection(db,'users',user.uid,'wishlists'),{
        universityId:selectedUniversity.id,
        admissionId:adm.id,
        order:wishlists.length,
        createdAt:new Date(),

        /* 個別上書きフィールド */
        customFaculty:null,
        customDepartment:null,
        customSubjects:null,
        customExamDate:null,
        customMemo:null,
        hasCustomEdit:false
      })

      loadWishlists(user.uid)
    }

    async function removeWishlist(id){
      if(!user) return
      await deleteDoc(doc(db,'users',user.uid,'wishlists',id))
      loadWishlists(user.uid)
    }

    /* ================= 個別編集保存 ================= */
    async function saveCustomEdit(){
      if(!user || !editTarget) return

      const ref = doc(db,'users',user.uid,'wishlists',editTarget.id)

      await updateDoc(ref,{
        customFaculty:editFaculty,
        customDepartment:editDepartment,
        customSubjects:editSubjects
          ? editSubjects.split(',').map(s=>s.trim())
          : null,
        customMemo:editMemo,
        hasCustomEdit:true
      })

      setEditTarget(null)
      loadWishlists(user.uid)
    }

    /* ================= wishlist参照型（高速版） ================= */
    useEffect(()=>{
      if(!user || wishlists.length===0){
        setWishlistDetails([])
        return
      }

      async function fetchDetails(){
        const results = []

        for(const w of wishlists){

          const univRef = doc(db,'universities',w.universityId)
          const univSnap = await getDoc(univRef)
          if(!univSnap.exists()) continue
          const universityData = univSnap.data()

          const admissionRef = doc(db,'universities',w.universityId,'admissions',w.admissionId)
          const admissionSnap = await getDoc(admissionRef)
          if(!admissionSnap.exists()) continue
          const admissionData = admissionSnap.data()

          results.push({
            id:w.id,
            order:w.order,
            universityName: universityData.name,
            officialUrl: universityData.officialUrl || null,
            ...admissionData,

            /* 個別データ */
            customFaculty:w.customFaculty || null,
            customDepartment:w.customDepartment || null,
            customSubjects:w.customSubjects || null,
            customExamDate:w.customExamDate || null,
            customMemo:w.customMemo || null,
            hasCustomEdit:w.hasCustomEdit || false
          })
        }

        results.sort((a,b)=>a.order-b.order)
        setWishlistDetails(results)
      }

      fetchDetails()

    },[wishlists])
    /* ================= カレンダー ================= */

    async function addCalendar(){
      if(!user) return alert('ログインしてください')
      if(!calDate || !calTitle) return alert('日付とタイトル必須')

      await addDoc(collection(db,'users',user.uid,'calendar'),{
        title:calTitle,
        date:calDate,
        time:calTime || null,
        createdAt:new Date()
      })

      setCalTitle('')
      setCalDate('')
      setCalTime('')
      loadCalendar(user.uid)
    }

    async function removeCalendar(id){
      if(!user) return
      await deleteDoc(doc(db,'users',user.uid,'calendar',id))
      loadCalendar(user.uid)
    }

    function daysInMonth(date){
      return new Date(date.getFullYear(),date.getMonth()+1,0).getDate()
    }

    function changeMonth(offset){
      const d = new Date(currentMonth)
      d.setMonth(d.getMonth()+offset)
      setCurrentMonth(d)
    }

    /* ================= カレンダー描画 ================= */
    function renderCalendar(){

      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const firstDay = new Date(year,month,1).getDay()
      const totalDays = daysInMonth(currentMonth)
      const cells = []
      const weekLabels = ['日','月','火','水','木','金','土']

      /* ----- 曜日ヘッダー ----- */
      weekLabels.forEach((w,i)=>{
        const isWeekend = (i===0 || i===6)
        cells.push(
          <div key={'w'+i} className={`cal-week ${isWeekend?'weekend':''}`}>{w}</div>
        )
      })

      /* ----- 空白セル ----- */
      for(let i=0;i<firstDay;i++){
        cells.push(<div key={'e'+i} className="cal-cell empty" />)
      }

      /* ----- 日付セル ----- */
      for(let d=1; d<=totalDays; d++){

        const dateObj = new Date(year,month,d)
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        const dayEvents = calendar.filter(c=>c.date===dateStr)

        const isWeekend = (dateObj.getDay()===0 || dateObj.getDay()===6)
        const isToday = today.toDateString() === dateObj.toDateString()

        cells.push(
          <div key={d} className={`cal-cell ${isToday?'today':''} ${isWeekend?'weekend':''}`}>
            <div className={`cal-date ${isWeekend?'weekend':''}`}>{d}</div>

            {dayEvents.map(e=>{

              /* ----- 日時計算 ----- */
              const startDate = new Date(`${e.date}T${e.time || '09:00'}`)
              const endDate = new Date(startDate)
              endDate.setHours(endDate.getHours()+1)

              const formatUTC = dt =>
                dt.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'

              /* ----- Google ----- */
              const googleUrl =
                `https://www.google.com/calendar/render?action=TEMPLATE`+
                `&text=${encodeURIComponent(e.title)}`+
                `&dates=${formatUTC(startDate)}/${formatUTC(endDate)}`+
                `&details=${encodeURIComponent('大学入試予定')}`

              /* ----- iPhone ICS ----- */
              const safeTitle = e.title.replace(/\n/g,' ')
              const icsContent =
    `BEGIN:VCALENDAR
    VERSION:2.0
    BEGIN:VEVENT
    SUMMARY:${safeTitle}
    DTSTART:${formatUTC(startDate)}
    DTEND:${formatUTC(endDate)}
    END:VEVENT
    END:VCALENDAR`

              const handleICSDownload = ()=>{
                const blob = new Blob([icsContent],{type:'text/calendar;charset=utf-8;'})
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${safeTitle}.ics`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }

              return (
                <div key={e.id} className="cal-event">
                  {e.time && `${e.time} `}{e.title}
                  <div style={{display:'flex',gap:6,marginTop:4}}>
                    <a href={googleUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:11}}>Google</a>
                    <button onClick={handleICSDownload} style={{fontSize:11}}>iPhone</button>
                    <button onClick={()=>removeCalendar(e.id)}>×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      }

      return cells
    }
    /* ========================== ローディング ========================== */
    if(loading) return <p>読み込み中...</p>
    /* ========================== JSX ========================== */
        return(
               <div className="page">
               
               <h1 className="title">大学検索</h1>
               {countdown!==null && (
                                     <div className="countdown">
                                     🎯 共通テストまであと {countdown} 日
                                     </div>
                                     )}
               
               {/* ================= フィルタ ================= */}
               <div className="filters">
               <input
               placeholder="大学名"
               value={keyword}
               onChange={e=>setKeyword(e.target.value)}
               />
               
               <select value={selectedPref} onChange={e=>setSelectedPref(e.target.value)}>
               <option value="">都道府県</option>
               {prefectures.map(p=>(
                                    <option key={p}>{p}</option>
                                    ))}
               </select>
               
               <select value={selectedType} onChange={e=>setSelectedType(e.target.value)}>
               <option value="">設置区分</option>
               <option value="国立">国立</option>
               <option value="公立">公立</option>
               <option value="私立">私立</option>
               </select>
               
               <select
               value={selectedFaculty}
               onChange={e=>{
                   setSelectedFaculty(e.target.value)
                   setSelectedDept('')
               }}
               >
               <option value="">学部</option>
               {faculties.map(f=>(
                                  <option key={f}>{f}</option>
                                  ))}
               </select>
               
               <select value={selectedDept} onChange={e=>setSelectedDept(e.target.value)}>
               <option value="">学科</option>
               {departments.map(d=>(
                                    <option key={d}>{d}</option>
                                    ))}
               </select>
               
               <select value={selectedSubject} onChange={e=>setSelectedSubject(e.target.value)}>
               <option value="">科目</option>
               {subjects.map(s=>(
                                 <option key={s}>{s}</option>
                                 ))}
               </select>
               </div>
               
               {/* ================= 検索結果 ================= */}
               <div className="results-area">
               {!hasFilter ? (
                              <p>検索条件を選択してください</p>
                              ) : (
                                   filtered.map(u=>(
                                                    <div
                                                    key={u.id}
                                                    className="card"
                                                    onClick={()=>{
                                                        setSelectedUniversity(u)
                                                        loadAdmissions(u.id)
                                                    }}
                                                    >
                                                    <div>{u.name}</div>
                                                    <div>{u.prefecture} / {u.establishedType}</div>
                                                    </div>
                                                    ))
                                   )}
               </div>
               
               {/* ================= モーダル ================= */}
               {selectedUniversity && (
                                       <div className="modal-overlay">
                                       <div className="modal">
                                       
                                       <h2>{selectedUniversity.name}</h2>
                                       <hr/>
                                       
                                       {admissions.map(adm=>(
                                                             <div key={adm.id} style={{marginBottom:16}}>
                                                             <h4>{adm.admissionType}</h4>
                                                             <p>{adm.faculty} / {adm.department}</p>
                                                             
                                                             {adm.stages?.map(stage=>(
                                                                                      <div key={stage.stage}>
                                                                                      <span className="badge badge-blue">
                                                                                      {stage.examCategory}
                                                                                      </span>
                                                                                      {stage.subjects?.map((s,i)=>(
                                                                                                                   <span key={i} className="badge badge-gray">
                                                                                                                   {s}
                                                                                                                   </span>
                                                                                                                   ))}
                                                                                      </div>
                                                                                      ))}
                                                             
                                                             <button onClick={()=>addWishlist(adm)}>
                                                             志望校に追加
                                                             </button>
                                                             </div>
                                                             ))}
                                       
                                       <button onClick={()=>setSelectedUniversity(null)}>
                                       閉じる
                                       </button>
                                       
                                       </div>
                                       </div>
                                       )}
               
               {/* ================= 志望校 ================= */}
               <h2>⭐ 志望校リスト</h2>
               
               {wishlistDetails.map((w,i)=>(
                                            <div key={w.id} className="wishlist-card">
                                            
                                            <strong>第{i+1}志望</strong>
                                            <p>
                                            <p>
                                            
                                             {w.universityName} /
                                             {w.customFaculty || w.faculty} /
                                             {w.customDepartment || w.department} /
                                             {w.admissionType}
                                            </p>
                                            </p>
                                            
                                            {w.stages?.map((stage,i2)=>(
                                              <div key={i2} style={{marginBottom:6}}>
                                                <span className="badge badge-blue">
                                                  {stage.stage===1?'一次試験':'二次試験'}：{stage.examCategory}
                                                </span>

                                               {(w.customSubjects || stage.subjects)?.map((sub,j)=>(
                                                 <span key={j} className="badge badge-gray">{sub}</span>
                                               ))}

                                              </div>
                                            ))}
                                            
                                            {/* 外部リンク */}
                                            <div style={{marginTop:8,display:'flex',gap:10,flexWrap:'wrap'}}>
                                            {w.officialUrl && (
                                                               <a
                                                               href={w.officialUrl}
                                                               target="_blank"
                                                               rel="noopener noreferrer"
                                                               className="link-btn"
                                                               >
                                                               🌐 公式サイト
                                                               </a>
                                                               )}
                                            
                                            {w.guidelineUrl && (
                                                                <a
                                                                href={w.guidelineUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="link-btn"
                                                                >
                                                                📄 募集要項
                                                                </a>
                                                                )}
                                            </div>
                                            
                                            <button onClick={()=>removeWishlist(w.id)}>
                                            削除
                                            </button>
                                            
                                            <button onClick={()=>removeWishlist(w.id)}>削除</button>

                                             <button
                                               onClick={()=>{
                                                 setEditTarget(w)
                                                 setEditFaculty(w.customFaculty || w.faculty)
                                                 setEditDepartment(w.customDepartment || w.department)
                                                 setEditSubjects((w.customSubjects || []).join(','))
                                                 setEditMemo(w.customMemo || '')
                                               }}
                                             >
                                               編集
                                             </button>
                                            
                                            </div>
                                            ))}
               
               {/* ================= カレンダー ================= */}
               <h2>📅 試験カレンダー</h2>
               
               <div>
               <input type="date" value={calDate} onChange={e=>setCalDate(e.target.value)} />
               <input type="time" value={calTime} onChange={e=>setCalTime(e.target.value)} />
               <input placeholder="タイトル" value={calTitle} onChange={e=>setCalTitle(e.target.value)} />
               <button onClick={addCalendar}>追加</button>
               </div>
               
               <div className="cal-header">
               <button onClick={()=>changeMonth(-1)}>◀</button>
               <h3>{currentMonth.getFullYear()}年 {currentMonth.getMonth()+1}月</h3>
               <button onClick={()=>changeMonth(1)}>▶</button>
               </div>
               
               <div className="calendar-grid">
               {renderCalendar()}
               </div>
               
               
               {editTarget && (
                 <div className="modal-overlay">
                   <div className="modal">
                     <h3>志望校詳細を編集</h3>

                     <input
                       value={editFaculty}
                       onChange={e=>setEditFaculty(e.target.value)}
                       placeholder="学部"
                     />

                     <input
                       value={editDepartment}
                       onChange={e=>setEditDepartment(e.target.value)}
                       placeholder="学科"
                     />

                     <input
                       value={editSubjects}
                       onChange={e=>setEditSubjects(e.target.value)}
                       placeholder="科目（カンマ区切り）"
                     />

                     <textarea
                       value={editMemo}
                       onChange={e=>setEditMemo(e.target.value)}
                       placeholder="メモ"
                     />

                     <button onClick={saveCustomEdit}>保存</button>
                     <button onClick={()=>setEditTarget(null)}>閉じる</button>
                   </div>
                 </div>
               )}
               
               
               
               </div>
               )}
