'use client'
import { useEffect,useMemo,useState } from 'react'
import { collection,getDocs,getDoc,addDoc,deleteDoc,doc,query,orderBy,updateDoc } from 'firebase/firestore'
import { db } from '@/firebaseConfig'
import { getAuth,onAuthStateChanged } from 'firebase/auth'
import './universities.css'

const UNIVERSITY_GROUPS = [
  { id: 'imperial', label: '旧帝大', names: ['北海道大学','東北大学','東京大学','名古屋大学','京都大学','大阪大学','九州大学'] },
  { id: 'kankandoritsu', label: '関関同立', names: ['関西大学','関西学院大学','同志社大学','立命館大学'] },
  { id: 'sankinkoryu', label: '産近甲龍', names: ['京都産業大学','近畿大学','甲南大学','龍谷大学'] },
  { id: 'hyogo', label: '兵庫県内', prefecture: '兵庫県' },
  { id: 'national', label: '国公立', types: ['国立','公立'] },
]

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
const [selectedGroup,setSelectedGroup] = useState('')

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
      selectedFaculty || selectedDept || selectedSubject || selectedGroup

    /* ================= フィルタ結果 ================= */
    const filtered = universities.filter(u=>{
      if(!hasFilter) return false
      if(keyword && !u.name?.toLowerCase().includes(keyword.toLowerCase())) return false
      if(selectedPref && u.prefecture!==selectedPref) return false
      if(selectedType && u.establishedType!==selectedType) return false
      if(selectedFaculty && !u.searchIndex?.faculties?.includes(selectedFaculty)) return false
      if(selectedDept && !u.searchIndex?.departments?.includes(selectedDept)) return false
      if(selectedSubject && !u.searchIndex?.subjects?.includes(selectedSubject)) return false
      if(selectedGroup){
        const group=UNIVERSITY_GROUPS.find(g=>g.id===selectedGroup)
        if(group?.names && !group.names.includes(u.name)) return false
        if(group?.prefecture && u.prefecture!==group.prefecture) return false
        if(group?.types && !group.types.includes(u.establishedType)) return false
      }
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
        universityId:selectedUniversity.id, admissionId:adm.id, order:wishlists.length, createdAt:new Date(),
        customFaculty:null, customDepartment:null, customSubjects:null, customExamDate:null,
        customMemo:null, hasCustomEdit:false
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
      if(!user||!editTarget) return
      const ref=doc(db,'users',user.uid,'wishlists',editTarget.id)
      await updateDoc(ref,{
        customFaculty:editFaculty, customDepartment:editDepartment,
        customSubjects:editSubjects?editSubjects.split(',').map(s=>s.trim()):null,
        customMemo:editMemo, hasCustomEdit:true
      })
      setEditTarget(null)
      loadWishlists(user.uid)
    }

    /* ================= wishlist参照型（高速版） ================= */
    useEffect(()=>{
      if(!user||wishlists.length===0){ setWishlistDetails([]); return }

      async function fetchDetails(){
        const results=[]
        for(const w of wishlists){
          const univRef=doc(db,'universities',w.universityId)
          const univSnap=await getDoc(univRef)
          if(!univSnap.exists()) continue
          const universityData=univSnap.data()

          const admissionRef=doc(db,'universities',w.universityId,'admissions',w.admissionId)
          const admissionSnap=await getDoc(admissionRef)
          if(!admissionSnap.exists()) continue
          const admissionData=admissionSnap.data()

          results.push({
            id:w.id, order:w.order,
            universityName:universityData.name, officialUrl:universityData.officialUrl||null,
            ...admissionData,
            customFaculty:w.customFaculty||null, customDepartment:w.customDepartment||null,
            customSubjects:w.customSubjects||null, customExamDate:w.customExamDate||null,
            customMemo:w.customMemo||null, hasCustomEdit:w.hasCustomEdit||false
          })
        }
        results.sort((a,b)=>a.order-b.order)
        setWishlistDetails(results)
      }

      fetchDetails()
    },[wishlists])
    /* ========================== ローディング ========================== */
    if(loading) return <p>読み込み中...</p>

    /* ========================== JSX ========================== */
    return(
    <main className="university-shell">
    <div className="page university-page">
    <header className="university-heading">
      <div>
        <span>UNIVERSITY FINDER</span>
        <h1>大学・入試情報</h1>
        <p>大学群や条件から調べて、気になる入試方式を志望校へ追加できます。</p>
      </div>
      {countdown!==null&&(<div className="countdown"><small>共通テストまで</small><strong>{countdown}</strong><span>日</span></div>)}
    </header>

    <section className="university-groups">
      <div className="university-section-heading"><span>QUICK SEARCH</span><h2>大学群から探す</h2></div>
      <div className="group-chips">
        {UNIVERSITY_GROUPS.map(group=>(
          <button
            type="button"
            key={group.id}
            className={selectedGroup===group.id?'active':''}
            onClick={()=>setSelectedGroup(selectedGroup===group.id?'':group.id)}
          >
            {group.label}
          </button>
        ))}
      </div>
    </section>

    {/* ================= フィルタ ================= */}
    <div className="university-section-heading"><span>FILTER</span><h2>条件を絞り込む</h2></div>
    <div className="filters">
    <input placeholder="大学名" value={keyword} onChange={e=>setKeyword(e.target.value)}/>
    <select value={selectedPref} onChange={e=>setSelectedPref(e.target.value)}>
    <option value="">都道府県</option>{prefectures.map(p=><option key={p}>{p}</option>)}
    </select>
    <select value={selectedType} onChange={e=>setSelectedType(e.target.value)}>
    <option value="">設置区分</option><option value="国立">国立</option><option value="公立">公立</option><option value="私立">私立</option>
    </select>
    <select value={selectedFaculty} onChange={e=>{setSelectedFaculty(e.target.value);setSelectedDept('')}}>
    <option value="">学部</option>{faculties.map(f=><option key={f}>{f}</option>)}
    </select>
    <select value={selectedDept} onChange={e=>setSelectedDept(e.target.value)}>
    <option value="">学科</option>{departments.map(d=><option key={d}>{d}</option>)}
    </select>
    <select value={selectedSubject} onChange={e=>setSelectedSubject(e.target.value)}>
    <option value="">科目</option>{subjects.map(s=><option key={s}>{s}</option>)}
    </select>
    </div>

    {/* ================= 検索結果 ================= */}
    <div className="results-area">
    {!hasFilter?(<p className="search-empty">大学群または検索条件を選択してください</p>):(
    <>
    <div className="results-count">{filtered.length}校が見つかりました</div>
    {filtered.map(u=>(
    <button type="button" key={u.id} className="card" onClick={()=>{setSelectedUniversity(u);loadAdmissions(u.id)}}>
    <span><strong>{u.name}</strong><small>{u.prefecture} / {u.establishedType}</small></span><b>詳細を見る →</b>
    </button>
    ))}
    </>
    )}
    </div>

    {/* ================= モーダル ================= */}
    {selectedUniversity&&(
    <div className="modal-overlay"><div className="modal">
    <h2>{selectedUniversity.name}</h2><hr/>
    {admissions.map(adm=>(
    <div key={adm.id} style={{marginBottom:16}}>
    <h4>{adm.admissionType}</h4>
    <p>{adm.faculty} / {adm.department}</p>
    {adm.stages?.map(stage=>(
    <div key={stage.stage}>
    <span className="badge badge-blue">{stage.examCategory}</span>
    {stage.subjects?.map((s,i)=><span key={i} className="badge badge-gray">{s}</span>)}
    </div>
    ))}
    <button onClick={()=>addWishlist(adm)}>志望校に追加</button>
    </div>
    ))}
    <button onClick={()=>setSelectedUniversity(null)}>閉じる</button>
    </div></div>
    )}

    {/* ================= 志望校 ================= */}
    <div className="university-section-heading wishlist-heading"><span>MY LIST</span><h2>志望校リスト</h2></div>

    {wishlistDetails.map((w,i)=>(
    <div key={w.id} className="wishlist-card">
    <strong>第{i+1}志望</strong>
    <p>{w.universityName} / {w.customFaculty||w.faculty} / {w.customDepartment||w.department} / {w.admissionType}</p>

    {w.stages?.map((stage,i2)=>(
    <div key={i2} style={{marginBottom:6}}>
    <span className="badge badge-blue">{stage.stage===1?'一次試験':'二次試験'}：{stage.examCategory}</span>
    {(w.customSubjects||stage.subjects)?.map((sub,j)=><span key={j} className="badge badge-gray">{sub}</span>)}
    </div>
    ))}

    <div style={{marginTop:8,display:'flex',gap:10,flexWrap:'wrap'}}>
    {w.officialUrl&&(<a href={w.officialUrl} target="_blank" rel="noopener noreferrer" className="link-btn">🌐 公式サイト</a>)}
    {w.guidelineUrl&&(<a href={w.guidelineUrl} target="_blank" rel="noopener noreferrer" className="link-btn">📄 募集要項</a>)}
    </div>

    <button onClick={()=>removeWishlist(w.id)}>削除</button>
    <button onClick={()=>{setEditTarget(w);setEditFaculty(w.customFaculty||w.faculty);setEditDepartment(w.customDepartment||w.department);setEditSubjects((w.customSubjects||[]).join(','));setEditMemo(w.customMemo||'')}}>編集</button>
    </div>
    ))}

    {editTarget&&(
    <div className="modal-overlay"><div className="modal">
    <h3>志望校詳細を編集</h3>
    <input value={editFaculty} onChange={e=>setEditFaculty(e.target.value)} placeholder="学部"/>
    <input value={editDepartment} onChange={e=>setEditDepartment(e.target.value)} placeholder="学科"/>
    <input value={editSubjects} onChange={e=>setEditSubjects(e.target.value)} placeholder="科目（カンマ区切り）"/>
    <textarea value={editMemo} onChange={e=>setEditMemo(e.target.value)} placeholder="メモ"/>
    <button onClick={saveCustomEdit}>保存</button>
    <button onClick={()=>setEditTarget(null)}>閉じる</button>
    </div></div>
    )}

    </div>
    </main>
    )
    }
