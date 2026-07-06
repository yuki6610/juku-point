'use client'

import { useState, useEffect } from 'react'
import { auth } from '../../../firebaseConfig'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import './study-log.css'

export default function StudyLogPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [students, setStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const [error, setError] = useState('')

  const router = useRouter()

  // 🔐 管理者認証
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login")
        return
      }

      try {
        const token = await user.getIdToken()
        const response = await fetch('/api/admin/study-logs', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        setStudents(result.students || [])
        setIsAdmin(true)
      } catch (e) {
        setError(e.message || '学習記録を取得できませんでした。')
      } finally {
        setLoading(false)
      }
    })

    return () => unsub()
  }, [router])

  // 📘 自習ログ取得
  const loadLogs = async (uid) => {
    setSelectedStudent(uid)
    setLogs([])
    setLogsLoading(true)
    setError('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('ログイン情報を確認できません。')
      const response = await fetch(`/api/admin/study-logs?uid=${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setLogs(result.logs || [])
    } catch (e) {
      setError(e.message || '自習ログを取得できませんでした。')
    } finally {
      setLogsLoading(false)
    }
  }

  if (loading) return <p>読み込み中...</p>
  if (!isAdmin) return <p role="alert">{error || 'アクセス権がありません。'}</p>

  return (
    <div className="studylog-container">
      
      <h1 className="studylog-title">📘 自習履歴（チェックインログ）</h1>
      {error && <p className="studylog-error" role="alert">{error}</p>}

      {/* ▼ 2カラムで並べる */}
      <div className="studylog-layout">

        {/* 左：生徒一覧 */}
        <div className="student-list-card">
          <h3 className="student-title">生徒一覧</h3>

          {students.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`student-item ${selectedStudent === s.id ? "active" : ""}`}
              onClick={() => loadLogs(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* 右：自習ログ */}
        <div className="log-card">
          <h3 className="log-title">📅 自習ログ</h3>

          {logsLoading && <p className="empty-log">読み込み中...</p>}
          {selectedStudent && !logsLoading && logs.length === 0 && (
            <p className="empty-log">自習記録がありません。</p>
          )}

          {logs.map((log, i) => {
            const dateLabel = log.date;

            // ✨ 今日の入退室状況（current session）
            const currentEnter = log.enterAt ? new Date(log.enterAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : "ー";

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
                    <p>入室：{s.enterAt ? new Date(s.enterAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : 'ー'}</p>
                    <p>退出：{s.exitAt ? new Date(s.exitAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : 'ー'}</p>
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
