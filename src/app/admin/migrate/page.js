'use client'

import { useState } from 'react'
import { db } from '@/../firebaseConfig'
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore'

// =========================
// 高校データをここに入力
// =========================
const schoolsData = [

  {
    name: '長田高校',
    deviation: 70,
    averageScore: 459,
    minScore: 440,
    internalTarget: 244,
    scoreTarget: 431,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },

  {
    name: '神戸高校',
    deviation: 69,
    averageScore: 444,
    minScore: 406,
    internalTarget: 232,
    scoreTarget: 423,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },

  {
    name: '兵庫高校',
    deviation: 67,
    averageScore: 446,
    minScore: 430,
    internalTarget: 238,
    scoreTarget: 416,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '星陵高校',
    deviation: 64,
    averageScore: 424,
    minScore: 404,
    internalTarget: 222,
    scoreTarget: 403,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '御影高校',
    deviation: 63,
    averageScore: 414,
    minScore: 390,
    internalTarget: 217,
    scoreTarget: 393,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
    displayOrder: 2,
  },
  
  {
    name: '北須磨高校',
    deviation: 62,
    averageScore: 388,
    minScore: 345,
    internalTarget: 203,
    scoreTarget: 370,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '葺合高校',
    deviation: 60,
    averageScore: 390,
    minScore: 362,
    internalTarget: 204,
    scoreTarget: 372,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '夢野台高校',
    deviation: 58,
    averageScore: 387,
    minScore: 341,
    internalTarget: 204,
    scoreTarget: 366,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '須磨東高校',
    deviation: 57,
    averageScore: 374,
    minScore: 347,
    internalTarget: 196,
    scoreTarget: 356,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '芦屋高校',
    deviation: 56,
    averageScore: 354,
    minScore: 304,
    internalTarget: 180,
    scoreTarget: 347,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '六甲アイランド高校',
    deviation: 55,
    averageScore: 352,
    minScore: 315,
    internalTarget: 179,
    scoreTarget: 345,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '須磨友が丘高校',
    deviation: 54,
    averageScore: 351,
    minScore: 327,
    internalTarget: 182,
    scoreTarget: 340,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '神戸学園都市高校',
    deviation: 53,
    averageScore: 331,
    minScore: 262,
    internalTarget: 176,
    scoreTarget: 310,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '神戸鈴蘭台高校',
    deviation: 53,
    averageScore: 330,
    minScore: 272,
    internalTarget: 178,
    scoreTarget: 305,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '芦屋高校',
    deviation: 56,
    averageScore: 354,
    minScore: 304,
    internalTarget: 180,
    scoreTarget: 347,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '須磨翔風高校',
    deviation: 52,
    averageScore: 330,
    minScore: 316,
    internalTarget: 175,
    scoreTarget: 311,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '舞子高校',
    deviation: 52,
    averageScore: 336,
    minScore: 302,
    internalTarget: 176,
    scoreTarget: 321,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '神戸高塚高校',
    deviation: 47,
    averageScore: 298,
    minScore: 265,
    internalTarget: 161,
    scoreTarget: 272,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '科学技術高校',
    deviation: 50,
    averageScore: 310,
    minScore: 290,
    internalTarget: 160,
    scoreTarget: 306,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '兵庫工業高校',
    deviation: 43,
    averageScore: 266,
    minScore: 242,
    internalTarget: 130,
    scoreTarget: 271,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
  {
    name: '神戸商業高校',
    deviation: 45,
    averageScore: 280,
    minScore: 253,
    internalTarget: 150,
    scoreTarget: 261,
    rate:'',
    course: '普通科',
    area: '神戸',
    district: '第1学区',
    public: true,
  },
  
]

export default function ImportSchoolsPage(){

  const [running,setRunning]=useState(false)
  const [message,setMessage]=useState('')

  const importSchools=async()=>{

    if(running) return

    if(!confirm('高校データを一括登録しますか？')) return

    setRunning(true)

    try{

      const batch=writeBatch(db)

      schoolsData.forEach((school)=>{

          const ref = doc(db,'schools',school.name)

        batch.set(ref,{
          ...school,
          createdAt:serverTimestamp(),
          updatedAt:serverTimestamp(),
        })

      })

      await batch.commit()

      setMessage(`✅ ${schoolsData.length}件登録しました`)

    }catch(e){

      console.error(e)

      setMessage('❌ 登録に失敗しました')

    }

    setRunning(false)

  }

  return(
    <div
      style={{
        maxWidth:700,
        margin:'40px auto',
        padding:20
      }}
    >

      <h1>高校データ一括登録</h1>

      <p>
        schoolsコレクションへ一括登録します。
      </p>

      <button
        onClick={importSchools}
        disabled={running}
      >
        {running ? '登録中...' : '高校データを登録'}
      </button>

      <p style={{marginTop:20}}>
        {message}
      </p>

    </div>
  )
}
