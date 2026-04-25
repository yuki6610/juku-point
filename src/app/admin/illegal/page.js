'use client'

import { useEffect, useState } from 'react'
import { db } from '../../../firebaseConfig'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import './illegal.css'

export default function IllegalListPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const auth = getAuth()
  const router = useRouter()

  // 管理者チェック
  const checkAdmin = async (uid) => {
    const adminRef = doc(db, 'admins', uid)
    const snap = await getDoc(adminRef)
    return snap.exists()
  }

  useEffect(() => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) return router.push('/login')

      const isAdmin = await checkAdmin(user.uid)
      if (!isAdmin) {
        alert('アクセス権がありません')
        return router.push('/mypage')
      }

      // 📌 不正コレクション取得
      const snap = await getDocs(collection(db, 'illegal_checkins'))
      const list = []

      for (const d of snap.docs) {
        const data = d.data()

        // 🔍 生徒情報の解決
        const userRef = doc(db, 'users', data.uid)
        const userSnap = await getDoc(userRef)

        list.push({
          id: d.id,
          ...data,
          name: userSnap.exists() ? userSnap.data().displayName : '不明',
          grade: userSnap.exists() ? userSnap.data().grade : '-'
        })
      }

      // 時間順に並べる（新しい順）
      list.sort((a, b) => new Date(b.time) - new Date(a.time))

      setRecords(list)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading">読み込み中...</div>

  return (
    <div className="illegal-container">
      <h1 className="illegal-title">不正チェックイン一覧</h1>

      <table className="illegal-table">
        <thead>
          <tr>
            <th>名前</th>
            <th>学年</th>
            <th>種別</th>
            <th>日時</th>
            <th>位置</th>
            <th>地図</th>
          </tr>
        </thead>

        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.grade || '-'}</td>

              {/* 種別（改善） */}
              <td style={{
                color:
                  r.type === 'enter' ? 'red' :
                  r.type === 'exit' ? 'orange' :
                  'gray'
              }}>
                {r.type === 'enter' && '入室不正'}
                {r.type === 'exit' && '退出不正'}
                {r.type === 'gps_error' && 'GPS取得失敗'}
              </td>

              <td>{new Date(r.time).toLocaleString()}</td>

              {/* 座標（エラー防止） */}
              <td>
                {Number.isFinite(r.lat) && Number.isFinite(r.lng)
                  ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`
                  : '取得失敗'}
              </td>

              {/* 地図（安全化） */}
              <td>
                {Number.isFinite(r.lat) && Number.isFinite(r.lng) ? (
                  <a
                    className="map-btn"
                    href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    地図
                  </a>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button className="back-btn" onClick={() => router.push('/admin')}>
        管理者ページに戻る
      </button>
    </div>
  )
}
