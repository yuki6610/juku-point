'use client'

import { useState, useEffect } from 'react'
import { db, auth } from '../../../firebaseConfig'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import './study-log.css'

export default function StudyLogPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [students, setStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const router = useRouter()

  // 🔐 管理者認証
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login")
        return
      }

      const adminRef = doc(db, "admins", user.uid)
      const adminSnap = await getDoc(adminRef)

      if (adminSnap.exists()) {
        setIsAdmin(true)
        loadStudents()
      }

      setLoading(false)
    })

    return () => unsub()
  }, [])

  // 🧑‍🎓 生徒情報取得
  const loadStudents = async () => {
    const snap = await getDocs(collection(db, "users"))
    const list = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }))
    setStudents(list)
  }

  // 📘 自習ログ取得
  const loadLogs = async (uid) => {
    setSelectedStudent(uid)
    setLogs([])

    const checkinCol = collection(db, `users/${uid}/checkins`)
    const snap = await getDocs(checkinCol)

    const list = snap.docs.map(d => ({
      date: d.id,
      ...d.data()
    }))

    list.sort((a, b) => (a.date < b.date ? 1 : -1))
    setLogs(list)
  }

  if (loading) return <p>読み込み中...</p>
  if (!isAdmin) return <p>アクセス権がありません。</p>

  return (
    <div className="studylog-container">
      
      <h1 className="studylog-title">📘 自習履歴（チェックインログ）</h1>

      {/* ▼ 2カラムで並べる */}
      <div className="studylog-layout">

        {/* 左：生徒一覧 */}
        <div className="student-list-card">
          <h3 className="student-title">生徒一覧</h3>

          {students.map((s) => (
            <div
              key={s.id}
              className={`student-item ${selectedStudent === s.id ? "active" : ""}`}
              onClick={() => loadLogs(s.id)}
            >
              {s.realName || s.displayName || "名前未登録"}
            </div>
          ))}
        </div>

        {/* 右：自習ログ */}
        <div className="log-card">
          <h3 className="log-title">📅 自習ログ</h3>

          {selectedStudent && logs.length === 0 && (
            <p className="empty-log">自習記録がありません。</p>
          )}

          {logs.map((log, i) => {
            const dateLabel = log.date;

            // ✨ 今日の入退室状況（current session）
            const currentEnter = log.enterAt ? new Date(log.enterAt).toLocaleTimeString() : "ー";

            // ✨ 過去のセッション
            const sessions = log.sessions || [];

            return (
              <div key={i} className="log-row">
                <div className="log-date">{dateLabel}</div>

                {/* ▼ 現在進行中のセッション（exit が無い場合のみ表示） */}
                {log.currentSessionActive && (
                  <div className="log-detail">
                    <p>入室：{currentEnter}</p>
                    <p>退出：ー</p>
                    <p>⏱ 自習：進行中</p>
                    <p>🏷 自習扱い：未確定</p>
                    <p>✨ XP：未</p>
                    <p>📍 位置：OK</p>
                  </div>
                )}

                {/* ▼ 完了済みセッション一覧 */}
                {sessions.map((s, idx) => (
                  <div key={idx} className="log-detail session-box">
                    <p>入室：{new Date(s.enterAt).toLocaleTimeString()}</p>
                    <p>退出：{new Date(s.exitAt).toLocaleTimeString()}</p>
                    <p>⏱ 自習：{s.minutes} 分</p>
                    <p>🏷 自習扱い：はい</p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

      </div>

      <button onClick={() => router.push("/admin")} className="back-btn">
        ← 管理者ページへ戻る
      </button>
    </div>
  )
}
