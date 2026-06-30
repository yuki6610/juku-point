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
import './summer.css'

export default function SummerPage(){

  const [loading,setLoading]=useState(true)
  const [user,setUser]=useState(null)

  const [ranking,setRanking]=useState([])
  const [myRank,setMyRank]=useState(0)
  const [myPoint,setMyPoint]=useState(0)

  const [totalPoint,setTotalPoint]=useState(0)
  const [yenPerPoint,setYenPerPoint]=useState(0.3)
  const [meal,setMeal]=useState('未定')
    
  useEffect(()=>{

    return onAuthStateChanged(getAuth(),async(currentUser)=>{

      if(!currentUser){
        location.href='/login'
        return
      }

      const userSnap=await getDoc(doc(db,'users',currentUser.uid))

      if(!userSnap.exists()){
        setLoading(false)
        return
      }

      const userData=userSnap.data()

      if(!(userData.courseTags||[]).includes('summer_course')){
        alert('このページは対象者のみ閲覧できます')
        location.href='/'
        return
      }

      setUser(currentUser)
        const adminsSnap = await getDocs(collection(db, "admins"));
        const adminIds = new Set(adminsSnap.docs.map(d => d.id));

      const unsubscribe=onSnapshot(collection(db,'users'),snap=>{

          const arr = snap.docs
            .map(d => ({
              uid: d.id,
              name: d.data().realName || d.data().displayName || "名前なし",
              point: d.data().summerExchangePoint || 0,
              tags: d.data().courseTags || []
            }))
            .filter(u =>
              u.tags.includes("summer_course") &&
              !adminIds.has(u.uid)
            )
            .sort((a, b) => b.point - a.point);

        setRanking(arr)

        const total=arr.reduce((s,v)=>s+v.point,0)
        setTotalPoint(total)

        const rank=arr.findIndex(v=>v.uid===currentUser.uid)+1

        setMyRank(rank)

        const me=arr.find(v=>v.uid===currentUser.uid)

        setMyPoint(me?.point||0)

      })

      const eventSnap=await getDoc(doc(db,'admin_data','summerEvent'))

      if(eventSnap.exists()){
        const d=eventSnap.data()
        setYenPerPoint(d.yenPerPoint??0.3)
        setMeal(d.meal||'未定')
      }

      setLoading(false)

      return unsubscribe

    })

  },[])

  if(loading) return <p>読み込み中...</p>

  return(
    <div className="summer-page">

      <h1>🍖 夏期イベント</h1>

      <div className="summer-card">
        <h2>総交換ポイント</h2>
        <div className="big-number">{totalPoint.toLocaleString()} pt</div>
      </div>

      <div className="summer-card">
        <h2>食事代</h2>
        <div className="big-number">
          {Math.round(totalPoint*yenPerPoint).toLocaleString()} 円
        </div>
      </div>

      <div className="summer-card">
        <h2>🍖 食事内容</h2>
        <div className="meal-name">{meal}</div>
        <p>（1位の生徒が決定）</p>
      </div>

      <div className="summer-card">

        <h2>🏆 ランキング</h2>

        {ranking.map((r,i)=>(
          <div className="rank-row" key={r.uid}>
            <span>
              {i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}位`}
            </span>

            <span>{r.name}</span>

            <span>{r.point.toLocaleString()} pt</span>
          </div>
        ))}

      </div>

      <div className="summer-card">

        <h2>🙋 あなた</h2>

        <div className="my-info">
          <p>順位：{myRank}位</p>
          <p>交換ポイント：{myPoint.toLocaleString()} pt</p>
        </div>

      </div>

    </div>
  )

}
