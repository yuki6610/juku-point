'use client'
import { useState } from 'react'
import { collection,getDocs,doc,updateDoc } from 'firebase/firestore'
import { db } from '@/firebaseConfig'

export default function RebuildSearchIndex(){

  const [loading,setLoading] = useState(false)
  const [log,setLog] = useState([])

  async function rebuild(){

    setLoading(true)
    const logs=[]

    const univSnap = await getDocs(collection(db,'universities'))

    for(const univDoc of univSnap.docs){

      const admissionsSnap = await getDocs(
        collection(db,'universities',univDoc.id,'admissions')
      )

      const faculties = new Set()
      const departments = new Set()
      const subjects = new Set()

      admissionsSnap.docs.forEach(adm=>{
        const data = adm.data()

        if(data.faculty) faculties.add(data.faculty)
        if(data.department) departments.add(data.department)

        data.stages?.forEach(stage=>{
          stage.subjects?.forEach(sub=>{
            subjects.add(sub)
          })
        })
      })

      await updateDoc(doc(db,'universities',univDoc.id),{
        searchIndex:{
          faculties:[...faculties],
          departments:[...departments],
          subjects:[...subjects]
        }
      })

      logs.push(`✅ ${univDoc.id} 更新完了`)
    }

    setLog(logs)
    setLoading(false)
  }

  return(
    <main className="admin-utility-page">
      <span>DATA MAINTENANCE</span>
      <h1>大学検索データの再構築</h1>
      <p>大学・学部・学科・受験科目の検索情報を最新状態に更新します。</p>
      <button onClick={rebuild} disabled={loading}>
        {loading?'処理中...':'再構築する'}
      </button>

      <div className="admin-utility-log">
        {log.map((l,i)=><div key={i}>{l}</div>)}
      </div>
    </main>
  )
}
