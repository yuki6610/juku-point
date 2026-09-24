'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ScoreManager from './ScoreManager'
import SchoolJudge from './SchoolJudge'
import ScoreSubmissions from './ScoreSubmissions'
import './score-hub.css'

const TABS = [
  { id: 'records', label: '成績確認・入力', note: '保存済み成績と新規入力' },
  { id: 'judge', label: '志望校判定・印刷', note: '比較、コメント、A4レポート' },
  { id: 'submissions', label: '提出状況', note: 'テスト・通知表の確認' },
]

export default function ScoreHubPage() {
  const router = useRouter()
  const [tab, setTab] = useState('records')

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    const student = new URLSearchParams(window.location.search).get('student')
    router.replace(`/admin/academics?tab=${requested === 'judge' || requested === 'submissions' ? requested : 'records'}${student ? `&student=${encodeURIComponent(student)}` : ''}`)
    if (TABS.some((item) => item.id === requested)) setTab(requested)
  }, [router])

  const selectTab = (next) => {
    setTab(next)
    window.history.replaceState(null, '', next === 'records' ? '/admin/score' : `/admin/score?tab=${next}`)
  }

  return <main className="score-hub">
    <header className="score-hub-header"><span>SCORES & ADMISSIONS</span><h1>成績・志望校</h1><p>成績の確認・入力から志望校比較、レポート印刷までまとめて行います。</p></header>
    <nav className="score-hub-tabs" aria-label="成績と志望校メニュー">
      {TABS.map((item) => <button type="button" key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => selectTab(item.id)}><strong>{item.label}</strong><small>{item.note}</small></button>)}
    </nav>
    <section className="score-hub-content">
      {tab === 'records' && <ScoreManager />}
      {tab === 'judge' && <SchoolJudge />}
      {tab === 'submissions' && <ScoreSubmissions />}
    </section>
  </main>
}
