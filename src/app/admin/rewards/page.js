'use client'

import { useEffect, useState } from 'react'
import { auth, db } from '../../../firebaseConfig'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import './rewards.css'

export default function AdminRewardsPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rewards, setRewards] = useState([])

  const [newReward, setNewReward] = useState({
    name: '',
    cost: '',
    image: '',
    stock: '',
    limit: '',
    category: 'snack',
    requiredTag: 'none',
    description: '',
    gachaEligible: true,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editReward, setEditReward] = useState(null)

  const router = useRouter()

  // ----------------------------------------------------------
  // 🔐 管理者確認
  // ----------------------------------------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return router.push('/login')

      const adminRef = doc(db, 'admins', user.uid)
      const snap = await getDoc(adminRef)
      if (snap.exists()) {
        setIsAdmin(true)
        fetchRewards()
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const fetchRewards = async () => {
    const snapshot = await getDocs(collection(db, 'rewards'))
    setRewards(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
  }

  // ----------------------------------------------------------
  // ➕ 新規追加
  // ----------------------------------------------------------
  const addReward = async () => {
    if (!newReward.name || !newReward.cost)
      return alert('名前とポイントは必須です')

    await addDoc(collection(db, 'rewards'), {
      name: newReward.name,
      cost: Number(newReward.cost),
      image: newReward.image,
      stock: Number(newReward.stock) || 0,
      limit: Number(newReward.limit) || 0,
      category: newReward.category,
      requiredTag:
        newReward.requiredTag === 'none' ? null : newReward.requiredTag,
      description: newReward.description || '',
      gachaEligible: Boolean(newReward.gachaEligible),
      createdAt: new Date(),
    })

    setNewReward({
      name: '',
      cost: '',
      image: '',
      stock: '',
      limit: '',
      category: 'snack',
      requiredTag: 'none',
      description: '',
      gachaEligible: true,
    })

    fetchRewards()
  }

  // ----------------------------------------------------------
  // ✏ 編集モーダル
  // ----------------------------------------------------------
  const openEditModal = (reward) => {
    setEditReward({
      ...reward,
      requiredTag: reward.requiredTag ?? 'none', // ← ここを修正
      gachaEligible: reward.gachaEligible !== false,
    })
    setModalOpen(true)
  }

  const closeModal = () => setModalOpen(false)

  const saveEditReward = async () => {
    if (!editReward) return

    const ref = doc(db, 'rewards', editReward.id)

    await updateDoc(ref, {
      name: editReward.name,
      cost: Number(editReward.cost),
      stock: Number(editReward.stock),
      limit: Number(editReward.limit),
      image: editReward.image,
      category: editReward.category,
      // ← 修正ポイント：none は null
      requiredTag:
        editReward.requiredTag === 'none'
          ? null
          : editReward.requiredTag,
      description: editReward.description || '',
      gachaEligible: Boolean(editReward.gachaEligible),
    })

    setModalOpen(false)
    fetchRewards()
  }

  const deleteReward = async (id) => {
    await deleteDoc(doc(db, 'rewards', id))
    fetchRewards()
  }

  if (loading) return <p>読み込み中...</p>
  if (!isAdmin) return <p>アクセス権がありません。</p>

  return (
    <div className="rewards-admin-container">
      <h1 className="admin-title">🎁 景品管理（PC版）</h1>

      {/* ----------------------------------------------------------
          新規追加フォーム
      ----------------------------------------------------------- */}
      <div className="admin-form-card">
        <h3>景品を追加</h3>

        <div className="admin-form-grid">
          <input
            type="text"
            placeholder="景品名"
            value={newReward.name}
            onChange={(e) =>
              setNewReward({ ...newReward, name: e.target.value })
            }
          />

          <input
            type="number"
            placeholder="必要ポイント"
            value={newReward.cost}
            onChange={(e) =>
              setNewReward({ ...newReward, cost: e.target.value })
            }
          />

          <select
            value={newReward.category}
            onChange={(e) =>
              setNewReward({ ...newReward, category: e.target.value })
            }
          >
            <option value="snack">🍭 お菓子</option>
            <option value="stationery">✏️ 文房具</option>
            <option value="limited">🎌 限定</option>
          </select>

          <select
            value={newReward.requiredTag}
            onChange={(e) =>
              setNewReward({ ...newReward, requiredTag: e.target.value })
            }
          >
            <option value="none">（通常）</option>
            <option value="spring_course">🌸 春期</option>
            <option value="summer_course">☀ 夏期</option>
            <option value="winter_course">❄ 冬期</option>
          </select>

          <input
            type="number"
            placeholder="在庫"
            value={newReward.stock}
            onChange={(e) =>
              setNewReward({ ...newReward, stock: e.target.value })
            }
          />

          <input
            type="number"
            placeholder="交換上限（0=無制限）"
            value={newReward.limit}
            onChange={(e) =>
              setNewReward({ ...newReward, limit: e.target.value })
            }
          />

          <input
            type="text"
            placeholder="画像URL"
            value={newReward.image}
            onChange={(e) =>
              setNewReward({ ...newReward, image: e.target.value })
            }
          />

          <textarea
            placeholder="説明（任意）"
            value={newReward.description}
            onChange={(e) =>
              setNewReward({ ...newReward, description: e.target.value })
            }
            className="description-input"
          ></textarea>

          <label className="gacha-eligible-field">
            <input type="checkbox" checked={newReward.gachaEligible} onChange={(e) => setNewReward({ ...newReward, gachaEligible: e.target.checked })} />
            ガチャの抽選対象にする
          </label>

          <button className="add-button" onClick={addReward}>
            ➕ 追加
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------
          景品一覧 + モーダル
      ----------------------------------------------------------- */}
      <h3>景品一覧</h3>

      <div className="rewards-grid-admin">
        {rewards.map((r) => (
          <div key={r.id} className="reward-card-admin">
            <h4>{r.name}</h4>

            {r.image && (
              <img src={r.image} alt={r.name} className="reward-image-admin" />
            )}

            <p>ポイント：{r.cost}</p>
            <p>在庫：{r.stock}</p>
            <p>上限：{r.limit === 0 ? 'なし' : `${r.limit}回`}</p>
            <p>カテゴリ：{r.category}</p>
            <p>ガチャ：{r.gachaEligible === false ? '対象外' : '対象'}</p>
            <p>
              講習限定：
              {r.requiredTag
                ? {
                    spring_course: '🌸 春期',
                    summer_course: '☀ 夏期',
                    winter_course: '❄ 冬期',
                  }[r.requiredTag]
                : 'なし'}
            </p>

            <button
              className="detail-button"
              onClick={() => openEditModal(r)}
            >
              詳細 / 編集
            </button>

            <button
              className="delete-button"
              onClick={() => deleteReward(r.id)}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      {/* ----------------------------------------------------------
          モーダル
      ----------------------------------------------------------- */}
      {modalOpen && editReward && (
        <div className="modal-overlay">
          <div className="modal-content">

            <h2>景品の詳細・編集</h2>

            <input
              type="text"
              value={editReward.name}
              onChange={(e) =>
                setEditReward({ ...editReward, name: e.target.value })
              }
            />

            <textarea
              value={editReward.description || ''}
              onChange={(e) =>
                setEditReward({ ...editReward, description: e.target.value })
              }
              placeholder="説明を入力"
            ></textarea>

            <input
              type="number"
              value={editReward.cost}
              onChange={(e) =>
                setEditReward({ ...editReward, cost: Number(e.target.value) })
              }
            />

            <input
              type="number"
              value={editReward.stock}
              onChange={(e) =>
                setEditReward({ ...editReward, stock: Number(e.target.value) })
              }
            />

            <input
              type="number"
              value={editReward.limit}
              onChange={(e) =>
                setEditReward({ ...editReward, limit: Number(e.target.value) })
              }
            />

            <input
              type="text"
              value={editReward.image}
              onChange={(e) =>
                setEditReward({ ...editReward, image: e.target.value })
              }
            />

            <select
              value={editReward.category}
              onChange={(e) =>
                setEditReward({ ...editReward, category: e.target.value })
              }
            >
              <option value="snack">お菓子</option>
              <option value="stationery">文房具</option>
              <option value="limited">限定</option>
            </select>

            <label className="gacha-eligible-field">
              <input type="checkbox" checked={editReward.gachaEligible !== false} onChange={(e) => setEditReward({ ...editReward, gachaEligible: e.target.checked })} />
              ガチャの抽選対象にする
            </label>

            <select
              value={editReward.requiredTag ?? 'none'}
              onChange={(e) =>
                setEditReward({
                  ...editReward,
                  requiredTag:
                    e.target.value === 'none' ? null : e.target.value,
                })
              }
            >
              <option value="none">通常</option>
              <option value="spring_course">🌸 春期</option>
              <option value="summer_course">☀ 夏期</option>
              <option value="winter_course">❄ 冬期</option>
            </select>

            <div className="modal-buttons">
              <button className="save-button" onClick={saveEditReward}>
                保存
              </button>
              <button className="close-button" onClick={closeModal}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <button onClick={() => router.push('/admin')}>
          ← 管理者トップに戻る
        </button>
      </div>
    </div>
  )
}
