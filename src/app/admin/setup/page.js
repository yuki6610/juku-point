'use client'
import { initializeFirestoreData } from '../../utils/initFirestoreData'

export default function SetupPage() {
  const handleInit = async () => {
    await initializeFirestoreData()
    alert("Firestore 初期化が完了しました！")
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '100px' }}>
      <h1>📦 Firestore 初期データ登録</h1>
      <button
        onClick={handleInit}
        style={{
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          padding: '10px 20px',
          fontSize: '18px',
          cursor: 'pointer',
        }}
      >
        データを登録する
      </button>
    </div>
  )
}
