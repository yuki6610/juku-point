'use client'

import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot
} from 'firebase/firestore'
import './summer.css'

export default function SummerPage() {
    
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState(null)
    
    const [ranking, setRanking] = useState([])
    const [myRank, setMyRank] = useState(0)
    const [myPoint, setMyPoint] = useState(0)
    
    const [totalPoint, setTotalPoint] = useState(0)
    const [yenPerPoint, setYenPerPoint] = useState(0.3)
    
    // ★追加
    const [endDate, setEndDate] = useState('2026-08-22')
    
    useEffect(() => {
        
        return onAuthStateChanged(getAuth(), async (currentUser) => {
            
            if (!currentUser) {
                location.href = '/login'
                return
            }
            
            const userSnap = await getDoc(doc(db, 'users', currentUser.uid))
            
            if (!userSnap.exists()) {
                setLoading(false)
                return
            }
            
            const userData = userSnap.data()
            
            if (!(userData.courseTags || []).includes('summer_course')) {
                alert('このページは対象者のみ閲覧できます')
                location.href = '/'
                return
            }
            
            setUser(currentUser)
            
            const adminsSnap = await getDocs(collection(db, 'admins'))
            const adminIds = new Set(adminsSnap.docs.map(d => d.id))
            
            const unsubscribe = onSnapshot(collection(db, 'users'), snap => {
                
                const arr = snap.docs
                .map(d => ({
                    uid: d.id,
                    name: d.data().realName || d.data().displayName || '名前なし',
                    point: d.data().summerExchangePoint || 0,
                    tags: d.data().courseTags || []
                }))
                .filter(v =>
                        v.tags.includes('summer_course') &&
                        !adminIds.has(v.uid)
                        )
                .sort((a, b) => b.point - a.point)
                
                setRanking(arr)
                
                const total = arr.reduce((s, v) => s + v.point, 0)
                setTotalPoint(total)
                
                const me = arr.find(v => v.uid === currentUser.uid)
                
                setMyPoint(me?.point || 0)
                
                setMyRank(
                          arr.findIndex(v => v.uid === currentUser.uid) + 1
                          )
                
            })
            
            const eventSnap = await getDoc(
                                           doc(db, 'admin_data', 'summerEvent')
                                           )
            
            if (eventSnap.exists()) {
                
                const d = eventSnap.data()
                
                setYenPerPoint(d.yenPerPoint ?? 0.3)
                
                // Firestoreに endDate があれば使う
                setEndDate(d.endDate ?? '2026-08-22')
            }
            
            setLoading(false)
            
            return unsubscribe
            
        })
        
    }, [])
    
    if (loading) return <p>読み込み中...</p>
        
        //==========================
        // 追加
        //==========================
        
        const contribution =
        totalPoint > 0
        ? ((myPoint / totalPoint) * 100).toFixed(1)
        : 0
        
        const remainDays = Math.max(
                                    0,
                                    Math.ceil(
                                              (new Date(endDate) - new Date()) /
                                              (1000 * 60 * 60 * 24)
                                              )
                                    )
        
        const top3 = ranking.slice(0, 3)
        
        return (
          <div className="summer-page">
            <header className="summer-hero">
              <div>
                <span>SUMMER CHALLENGE 2026</span>
                <h1>夏を頑張った分、<br />楽しみが大きくなる。</h1>
                <p>景品ストアで交換した対象ポイントが、イベントの食事代に加算されます。</p>
              </div>
              <div className="summer-countdown">
                <small>イベント終了まで</small>
                <strong>{remainDays}</strong>
                <span>DAYS</span>
              </div>
            </header>

            <div className="summer-info">
              <span>🏆</span>
              <div>
                <strong>ランキング1位が食事内容を決定！</strong>
                <p>対象景品を交換して、みんなでイベントを盛り上げよう。</p>
              </div>
            </div>

            {/* TOP3 */}
            <div className="top3-wrap">

              {top3[1] && (
                <div className="top-card silver">
                  <div className="medal">🥈</div>
                  <div className="top-name">{top3[1].name}</div>
                  <div className="top-point">
                    {top3[1].point.toLocaleString()} pt
                  </div>
                </div>
              )}

              {top3[0] && (
                <div className="top-card gold">
                  <div className="medal">🥇</div>
                  <div className="top-name">{top3[0].name}</div>
                  <div className="top-point">
                    {top3[0].point.toLocaleString()} pt
                  </div>
                </div>
              )}

              {top3[2] && (
                <div className="top-card bronze">
                  <div className="medal">🥉</div>
                  <div className="top-name">{top3[2].name}</div>
                  <div className="top-point">
                    {top3[2].point.toLocaleString()} pt
                  </div>
                </div>
              )}

            </div>

            <div className="summer-stats">
              <div className="summer-card point-stat">
                <span>みんなの交換ポイント</span>
                <div className="big-number">{totalPoint.toLocaleString()} <small>pt</small></div>
              </div>
              <div className="summer-card meal-stat">
                <span>現在の食事代</span>
                <div className="big-number">{Math.round(totalPoint * yenPerPoint).toLocaleString()} <small>円</small></div>
              </div>
            </div>


            <div className="summer-card">

              <div className="section-heading">
                <div><span>LEADERBOARD</span><h2>みんなのランキング</h2></div>
                <small>{ranking.length}人が参加中</small>
              </div>
                
                {ranking.map((r, i) => (
                  <div className="rank-row" key={r.uid}>

                    <span className="rank-number">
                      {i === 0
                        ? "🥇"
                        : i === 1
                        ? "🥈"
                        : i === 2
                        ? "🥉"
                        : `${i + 1}位`}
                    </span>

                    <span className="rank-name">
                      {r.name}
                    </span>

                    <span className="rank-point">
                      {r.point.toLocaleString()} pt
                    </span>

                  </div>
                ))}

              </div>

              <div className="summer-card">

                <div className="section-heading">
                  <div><span>YOUR STATUS</span><h2>あなたの現在地</h2></div>
                </div>

                <div className="my-info">

                  <p>
                    <strong>順位</strong>
                    <br />
                    {myRank} 位
                  </p>

                  <p>
                    <strong>交換ポイント</strong>
                    <br />
                    {myPoint.toLocaleString()} pt
                  </p>

                  <p>
                    <strong>全体の貢献度</strong>
                    <br />
                    {contribution} %
                  </p>

                </div>

              </div>

            </div>
          )
        }
