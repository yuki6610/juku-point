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
            title: '📚 宿題管理',
            desc: '提出確認・経験値付与',
            color: 'blue',
            path: '/admin/homework',
        },
        {
            title: '🧠 単語テスト管理',
            desc: '正答数入力・XP計算',
            color: 'purple',
            path: '/admin/tango',
        },
        {
            title: '🎓 生徒管理',
            desc: 'XP/Lv/ポイント調整・称号付与',
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
            title: '🏫 生活態度',
            desc: '宿題提出、遅刻記録',
            color: 'sky',
            path: '/admin/behavior',
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
            <h1 className="admin-title">👑 管理者メニュー</h1>
            <p className="admin-subtitle">管理したい項目を選択してください。</p>
            
            <button
            className="admin-btn season-btn"
            onClick={startNewSeason}
            >
            🏆 学期開始
            </button>
            
            <div className="admin-grid">
            {pages.map((p) => (
                               <div
                               key={p.title}
                               className={`admin-card admin-${p.color}`}
                               onClick={() => router.push(p.path)}
                               >
                               <h2 className="admin-card-title">{p.title}</h2>
                               <p className="admin-card-desc">{p.desc}</p>
                               </div>
                               ))}
            </div>
            </div>
            )
}
    
    
