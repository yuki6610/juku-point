'use client'

import './admin.css'
import { useRouter } from 'next/navigation'
import { getCurrentSeason } from "../utils/season";
import { resetSeason } from "../utils/resetSeason";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

export default function AdminPage() {
    const router = useRouter()
    
    const pages = [
        {
            title: '学習記録',
            desc: '出欠・宿題・単語テスト・生活態度',
            color: 'blue',
            path: '/admin/lesson-records',
        },
        {
            title: '🎓 生徒管理',
            desc: 'XP/Lv/ポイント調整・コース設定',
            color: 'indigo',
            path: '/admin/students',
        },
        {
            title: '🔑 入退室PIN管理',
            desc: '入室/退出のPIN発行',
            color: 'orange',
            path: '/admin/checkins',
        },
        {
            title: '⏱ 自習管理',
            desc: '入室・退出状況と強制退出',
            color: 'teal',
            path: '/admin/qr',
        },
        {
            title: '🚨 不正検知',
            desc: '位置情報/不正記録の確認',
            color: 'red',
            path: '/admin/illegal',
        },
        {
            title: '🎁 景品管理',
            desc: '交換景品・必要ポイント設定',
            color: 'green',
            path: '/admin/rewards',
        },
        {
            title: '📜 景品交換履歴',
            desc: '生徒ごとの交換ログ',
            color: 'amber',
            path: '/admin/rewardHistory',
        },
        
        
        {
            title: '📘 自習履歴',
            desc: '生徒の入退室履歴・自習ログ',
            color: 'cyan',
            path: '/admin/study-log',
        },
        
        {
            title: '✅ 出席確認',
            desc: '高校生の出席確認',
            color: 'orange',
            path: '/admin/attend',
        },
        
        {
            title: '📝 成績承認',
            desc: '五教科・内申の承認と修正',
            color: 'pink',
            path: '/admin/approve',
        },
        {
            title: '🏫 志望校判定',
            desc: '生徒別の志望校判定確認',
            color: 'sky',
            path: '/admin/judge',
        },
        
        {
            title: '🏫 成績入力',
            desc: '成績記録',
            color: 'sky',
            path: '/admin/score',
        },
        
        
    ]
    
    const startNewSeason = async () => {
        if (!confirm("新学期を開始しますか？\nこの操作は元に戻せません。")) {
            return;
        }
        
        try {
            const currentSeason = getCurrentSeason();
            
            const seasonRef = doc(db, "admin_data", "season");
            const seasonSnap = await getDoc(seasonRef);
            
            if (!seasonSnap.exists()) {
                alert("seasonデータがありません。");
                return;
            }
            
            const lastResetSeason = seasonSnap.data().lastResetSeason;
            
            if (currentSeason.id === lastResetSeason) {
                alert("現在の学期はすでに開始済みです。");
                return;
            }
            
            await resetSeason(currentSeason, lastResetSeason);
            
            alert("✅ 新学期へ切り替えました！");
        } catch (e) {
            console.error(e);
            alert("学期切替に失敗しました。");
        }
    };
    
    return (
            <div className="admin-page">
            <header className="admin-hero">
              <div>
                <p className="admin-eyebrow">ADMIN CONSOLE</p>
                <h1 className="admin-title">管理ダッシュボード</h1>
                <p className="admin-subtitle">生徒・学習・ポイントの状況を管理します。</p>
              </div>
              <button className="season-btn" onClick={startNewSeason}>
                新学期を開始
              </button>
            </header>

            <div className="admin-section-heading">
              <span>TOOLS</span>
              <h2>管理メニュー</h2>
            </div>
            
            <div className="admin-grid">
            {pages.map((p) => (
                               <button
                               key={p.title}
                               className={`admin-card admin-${p.color}`}
                               onClick={() => router.push(p.path)}
                               >
                               <h2 className="admin-card-title">{p.title}</h2>
                               <p className="admin-card-desc">{p.desc}</p>
                               <span className="admin-card-arrow">→</span>
                               </button>
                               ))}
            </div>
            </div>
            )
}
    
    
