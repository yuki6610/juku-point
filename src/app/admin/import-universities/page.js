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
    <div style={{padding:40}}>
      <h1>searchIndex再構築</h1>
      <button onClick={rebuild} disabled={loading}>
        {loading?'処理中...':'再構築する'}
      </button>

      <div style={{marginTop:20}}>
        {log.map((l,i)=><div key={i}>{l}</div>)}
      </div>
    </div>
  )
}
