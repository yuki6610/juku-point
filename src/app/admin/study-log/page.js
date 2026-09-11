'use client'

import { useEffect, useState } from 'react'
import CurrentStudy from '../qr/page'
import StudyHistory from './StudyHistory'
import IllegalCheckins from '../illegal/page'
import './study-hub.css'

const TABS = [
  { id: 'current', label: '現在自習中', note: '入室状況と強制退出' },
  { id: 'history', label: '自習履歴', note: '学習時間と入退室記録' },
  { id: 'alerts', label: '要確認', note: '位置情報と不正記録' },
]

export default function StudyManagementPage() {
  const [tab, setTab] = useState('current')

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (TABS.some((item) => item.id === requested)) setTab(requested)
  }, [])

  const selectTab = (next) => {
    setTab(next)
    window.history.replaceState(null, '', `/admin/study-log?tab=${next}`)
  }

  return <main className="study-hub">
    <header className="study-hub-header"><span>SELF STUDY OPERATIONS</span><h1>自習管理</h1><p>現在の入室状況、過去の学習時間、位置情報の要確認記録をまとめて確認します。</p></header>
    <nav className="study-hub-tabs" aria-label="自習管理メニュー">
      {TABS.map((item) => <button type="button" key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => selectTab(item.id)}><strong>{item.label}</strong><small>{item.note}</small></button>)}
    </nav>
    <section className="study-hub-content">
      {tab === 'current' && <CurrentStudy />}
      {tab === 'history' && <StudyHistory />}
      {tab === 'alerts' && <IllegalCheckins />}
    </section>
  </main>
}
