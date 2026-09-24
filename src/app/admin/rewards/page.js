'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RewardCatalog from './RewardCatalog'
import RewardHistory from './RewardHistory'
import './rewards-hub.css'

const TABS = [
  { id: 'catalog', label: '景品・在庫', note: '景品の登録、価格、在庫' },
  { id: 'exchange', label: '通常交換', note: '交換結果と引き渡し' },
]

export default function RewardsHubPage() {
  const router = useRouter()
  const [tab, setTab] = useState('catalog')

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    router.replace(`/admin/points?tab=${requested === 'catalog' ? 'catalog' : 'exchange'}`)
    if (TABS.some((item) => item.id === requested)) setTab(requested)
  }, [router])

  const selectTab = (next) => {
    setTab(next)
    window.history.replaceState(null, '', next === 'catalog' ? '/admin/rewards' : `/admin/rewards?tab=${next}`)
  }

  return (
    <div className="rewards-hub">
      <header className="rewards-hub-header">
        <div>
          <span>REWARD OPERATIONS</span>
          <h1>ポイント・景品管理</h1>
          <p>景品在庫と通常交換を一か所で管理します。</p>
        </div>
      </header>
      <nav className="rewards-hub-tabs" aria-label="景品管理メニュー">
        {TABS.map((item) => (
          <button type="button" key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => selectTab(item.id)}>
            <strong>{item.label}</strong><small>{item.note}</small>
          </button>
        ))}
      </nav>
      <section className="rewards-hub-content">
        {tab === 'catalog' && <RewardCatalog />}
        {tab === 'exchange' && <RewardHistory />}
      </section>
    </div>
  )
}
