'use client'

import { useEffect, useState } from 'react'
import { db } from '../../firebaseConfig'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  arrayUnion,
} from 'firebase/firestore'
import {
  FaGift,
  FaBook,
  FaPen,
  FaEraser,
  FaCookieBite,
  FaIceCream,
  FaGamepad,
  FaAppleAlt,
  FaTshirt,
  FaMusic,
  FaQuestion,
  FaUtensils,
  FaShoppingCart,
  FaHighlighter,
  FaPencilAlt,
  FaRuler,
  FaStickyNote,
  FaSortAmountUp,      // ← 追加
  FaSortAmountDown     // ← 追加
} from "react-icons/fa";
import './rewards.css'

// 🔹 景品名 → アイコン自動判定（文房具＋限定報酬対応）
const getIconForReward = (name) => {
  if (!name) return <FaGift className="reward-icon default" />

  const lower = name.toLowerCase()

  // -------------------------
  // 📚 文房具
  // -------------------------
  if (lower.includes('ノート') || lower.includes('note') || lower.includes('book'))
    return <FaBook className="reward-icon note" />

  if (lower.includes('ペン') || lower.includes('pen'))
    return <FaPen className="reward-icon pen" />

  if (lower.includes('蛍光') || lower.includes('highlighter'))
    return <FaHighlighter className="reward-icon highlighter" />

  if (lower.includes('シャー') || lower.includes('pencil'))
    return <FaPencilAlt className="reward-icon pencil" />

  if (lower.includes('定規') || lower.includes('ruler'))
    return <FaRuler className="reward-icon ruler" />

  if (lower.includes('ふせん') || lower.includes('付箋') || lower.includes('sticky'))
    return <FaStickyNote className="reward-icon sticky" />

  if (lower.includes('消し') || lower.includes('eraser'))
    return <FaEraser className="reward-icon eraser" />

  // -------------------------
  // 🍬 お菓子
  // -------------------------
  if (lower.includes('お菓子') || lower.includes('snack') || lower.includes('スナック'))
    return <FaCookieBite className="reward-icon snack" />
      
      if (lower.includes('アイス') ||lower.includes('ice') ||lower.includes('icecream'))
        return <FaIceCream className="reward-icon ice" />

      // ⭐ アイス②（ソフトクリーム系）
      if (lower.includes('高級アイス') ||lower.includes('softcream'))
        return <FaIceCream className="reward-icon soft" />
  // -------------------------
  // 🍽 限定報酬（コストコ / ご飯奢り）
  // -------------------------
  if (lower.includes('コストコ') || lower.includes('食べ') || lower.includes('ご飯') || lower.includes('奢り'))
    return <FaUtensils className="reward-icon dinner" />

  if (lower.includes('買い出し') || lower.includes('荷物') || lower.includes('同行') || lower.includes('shopping'))
    return <FaShoppingCart className="reward-icon costco" />

  // -------------------------
  // 🎮 その他
  // -------------------------
  if (lower.includes('ゲーム') || lower.includes('game'))
    return <FaGamepad className="reward-icon game" />

  if (lower.includes('りんご') || lower.includes('apple'))
    return <FaAppleAlt className="reward-icon apple" />

  if (lower.includes('tシャツ') || lower.includes('シャツ') || lower.includes('shirt'))
    return <FaTshirt className="reward-icon shirt" />

  if (lower.includes('音楽') || lower.includes('cd') || lower.includes('music'))
    return <FaMusic className="reward-icon music" />

  // -------------------------
  // ❓ デフォルト
  // -------------------------
  return <FaQuestion className="reward-icon unknown" />
}

export default function RewardsPage() {
    const [rewards, setRewards] = useState([])
    const [filteredRewards, setFilteredRewards] = useState([])
    const [categories, setCategories] = useState([])
    const [selectedCategory, setSelectedCategory] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    const [showAffordableOnly, setShowAffordableOnly] = useState(false)
    const [sortOrder, setSortOrder] = useState('asc')
    const [points, setPoints] = useState(0)
    const [loading, setLoading] = useState(true)
    
    // モーダル用
    const [selectedReward, setSelectedReward] = useState(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [rewardHistory, setRewardHistory] = useState([])
    const [userId, setUserId] = useState(null)
    
    // 🔥 初期データ読み込み
    useEffect(() => {
        const auth = getAuth()
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                window.location.href = '/login'
                return
            }
            try {
                const uid = currentUser.uid
                setUserId(uid)
                const userRef = doc(db, 'users', uid)
                const userSnap = await getDoc(userRef)
                let userData = null
                if (userSnap.exists()) {
                    userData = userSnap.data()
                } else {
                    // 初ログイン → デフォルト作成
                    userData = {
                        displayName: currentUser.displayName || '未登録ユーザー',
                        points: 0,
                        courseTags: [],
                        rewardHistory: [],
                        createdAt: new Date(),
                    }
                    await setDoc(userRef, userData)
                }
                
                const userTags = Array.isArray(userData.courseTags) ? userData.courseTags : []
                setPoints(userData.points || 0)
                setRewardHistory(Array.isArray(userData.rewardHistory) ? userData.rewardHistory : [])
                
                // 🎁 景品読み込み
                const snap = await getDocs(collection(db, 'rewards'))
                const rewardsList = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
                
                // 🌟 限定景品フィルタ
                const visibleRewards = rewardsList.filter((reward) => {
                    const rt = reward.requiredTag
                    if (!rt || rt.trim() === '') return true
                        return userTags.includes(rt)
                        })
                
                setRewards(visibleRewards)
                setFilteredRewards(visibleRewards)
                
                // 🔖 カテゴリ：「限定」は人工的に追加（limitedは除外）
                const uniqueCategories = [
                    ...new Set(visibleRewards.map((r) => r.category || 'その他')),
                       '限定',
                ]
                const cleanedCategories = uniqueCategories.filter((c) => c !== 'limited')
                setCategories(cleanedCategories)
            } catch (error) {
                console.error('Error:', error)
            } finally {
                setLoading(false)
            }
        })
        return () => unsubscribe()
    }, [])
    
    // 🔥 フィルタリング
    useEffect(() => {
        let result = [...rewards]
        if (selectedCategory !== '') {
            if (selectedCategory === '限定') {
                result = result.filter((r) => r.requiredTag)
            } else {
                result = result.filter((r) => (r.category || 'その他') === selectedCategory)
            }
        }
        if (searchTerm.trim() !== '') {
            result = result.filter((r) =>
                                   r.name.toLowerCase().includes(searchTerm.toLowerCase())
                                   )
        }
        if (showAffordableOnly) {
            result = result.filter((r) => r.cost <= points)
        }
        result.sort((a, b) => (sortOrder === 'asc' ? a.cost - b.cost : b.cost - a.cost))
        setFilteredRewards(result)
    }, [rewards, selectedCategory, searchTerm, showAffordableOnly, sortOrder, points])
    
    // 🔢 その生徒がその景品を何回交換したか
    const getUsedCount = (reward) =>
    rewardHistory.filter((h) =>
                         h.rewardId ? h.rewardId === reward.id : h.name === reward.name
                         ).length
    
    
    // モーダル開閉（説明用）
    const openInfoModal = (reward) => {
      setSelectedReward(reward)
      setIsModalOpen(true)
    }
    const closeModal = () => {
      setSelectedReward(null)
      setIsModalOpen(false)
    }

    // 🎁 実際の交換処理（トランザクション）
    const handleRedeem = async () => {
      if (!selectedReward) return
      const reward = selectedReward
      if (!userId) return alert('ログインしてください。')
      if (points < reward.cost) return alert('ポイントが足りません。')

      try {
        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', userId)
          const rewardRef = doc(db, 'rewards', reward.id)
          const userSnap = await transaction.get(userRef)
          const rewardSnap = await transaction.get(rewardRef)

          if (!userSnap.exists()) throw new Error('ユーザーが見つかりません。')
          if (!rewardSnap.exists()) throw new Error('景品が見つかりません。')

          const userData = userSnap.data()
          const rewardData = rewardSnap.data()
          const currentPoints = userData.points ?? 0
          const historyArr = Array.isArray(userData.rewardHistory) ? userData.rewardHistory : []

          if (currentPoints < rewardData.cost) throw new Error('ポイントが足りません。')
          if (rewardData.stock !== undefined && rewardData.stock <= 0)
            throw new Error('在庫切れです。')

          // 👤 一人あたりの上限チェック
          const limit = rewardData.limit ?? 0
          if (limit > 0) {
            const usedCount = historyArr.filter((h) =>
              h.rewardId ? h.rewardId === rewardRef.id : h.name === rewardData.name
            ).length

            if (usedCount >= limit) {
              throw new Error(`この景品は一人${limit}個までです。`)
            }
          }

            const newHistory = {
              type: "reward",              // 交換
              rewardId: rewardRef.id,
              name: rewardData.name,
              cost: -rewardData.cost,      // マイナスで記録
              date: new Date(),
            };

          transaction.update(userRef, {
            points: currentPoints - rewardData.cost,
            rewardHistory: arrayUnion(newHistory),
          })

          if (rewardData.stock !== undefined) {
            transaction.update(rewardRef, {
              stock: Math.max(0, rewardData.stock - 1),
            })
          }
        })

        // ローカル状態更新
        const newHistoryLocal = {
          rewardId: reward.id,
          name: reward.name,
          cost: reward.cost,
          date: new Date(),
        }

        setPoints((prev) => prev - reward.cost)
        setRewardHistory((prev) => [...prev, newHistoryLocal])

        alert(`🎉 ${reward.name} を交換しました！`)
        closeModal()
      } catch (e) {
        alert(e.message || '交換に失敗しました')
      }
    }

    if (loading) return <p className="loading-text">読み込み中...</p>

    return (
      <div className="rewards-container">
        <h1 className="title">🎁 景品交換</h1>

        <p className="points-text">
          あなたのポイント：
          <span className="points-value">{points} pt</span>
        </p>

        {/* 🔍 フィルタバー */}
        <div className="filter-bar">
          <input
            type="text"
            placeholder="景品を検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="sort-button"
          >
            {sortOrder === 'asc' ? <FaSortAmountUp /> : <FaSortAmountDown />}
          </button>

          <label className="affordable-toggle">
            <input
              type="checkbox"
              checked={showAffordableOnly}
              onChange={(e) => setShowAffordableOnly(e.target.checked)}
            />
            交換できる景品のみ
          </label>
        </div>

        {/* 🔖 カテゴリ */}
        <div className="category-dropdown">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="category-select"
          >
            <option value="">すべて</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
            
            {/* 🎁 景品一覧 */}
            <div className="rewards-grid">
              {filteredRewards.map((reward) => {
                const limit = reward.limit ?? 0
                const usedCount = getUsedCount(reward)
                const remain = limit > 0 ? Math.max(limit - usedCount, 0) : null

                return (
                  <div key={reward.id} className="reward-card">
                    <div className="reward-image-container">
                      {reward.image ? (
                        <img src={reward.image} alt={reward.name} className="reward-image" />
                      ) : (
                        getIconForReward(reward.name)
                      )}
                    </div>

                    {/* 名前 + 説明アイコン */}
                    <div className="reward-name-row">
                      <p className="reward-name">{reward.name}</p>
                      <span
                        className="info-icon"
                        onClick={() => openInfoModal(reward)}
                      >
                        ℹ️
                      </span>
                    </div>

                    <p className="reward-cost">{reward.cost} pt</p>

                    {limit > 0 && (
                      <p className="reward-limit">
                        交換上限{limit}個
                      </p>
                    )}

                    {reward.stock !== undefined && (
                      <p className={`reward-stock ${reward.stock <= 1 ? 'low-stock' : ''}`}>
                        {reward.stock > 0 ? `在庫：${reward.stock}` : '在庫なし'}
                      </p>
                    )}

                    {/* 交換ボタン→モーダルは開かず即交換 */}
                    <button
                      onClick={() => {
                        setSelectedReward(reward)
                        handleRedeem()
                      }}
                      className="redeem-button"
                      disabled={
                        (reward.stock !== undefined && reward.stock <= 0) ||
                        (limit > 0 && remain <= 0)
                      }
                    >
                      {reward.stock !== undefined && reward.stock <= 0
                        ? '在庫なし'
                        : limit > 0 && remain <= 0
                        ? '上限に達しました'
                        : '交換する'}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* 📝 説明モーダル（ℹ️ のみで開く） */}
            {isModalOpen && selectedReward && (
              <div className="reward-modal-overlay" onClick={closeModal}>
                <div className="reward-modal" onClick={(e) => e.stopPropagation()}>
                  <h2>{selectedReward.name}</h2>

                  <p className="modal-cost">必要ポイント：{selectedReward.cost} pt</p>

                  {selectedReward.description ? (
                    <p className="modal-description">{selectedReward.description}</p>
                  ) : (
                    <p className="modal-description">説明は登録されていません。</p>
                  )}

                  {selectedReward.limit > 0 && (
                    <p className="modal-limit">
                      一人{selectedReward.limit}個まで（現在 {getUsedCount(selectedReward)} 個交換）
                    </p>
                  )}

                  {selectedReward.stock !== undefined && (
                    <p className="modal-stock">
                      {selectedReward.stock > 0
                        ? `在庫：${selectedReward.stock}`
                        : '在庫なし'}
                    </p>
                  )}

                  <div className="modal-buttons">
                    <button onClick={closeModal} className="modal-cancel">
                      閉じる
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      }
