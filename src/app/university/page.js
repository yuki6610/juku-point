"use client"

import { useRouter } from "next/navigation"
import "./university.css"

export default function UniversityPage() {
  const router = useRouter()

  return (
    <div className="university-page">
      <div className="card">
        <h1>🎓 大学入試情報</h1>

        <p className="coming">
          Coming Soon...
        </p>

        <p className="desc">
          このページでは大学入試情報、共通テスト情報、
          志望校分析などを提供予定です。
        </p>

        <button onClick={() => router.back()} className="back-btn">
          ← 戻る
        </button>
      </div>
    </div>
  )
}
