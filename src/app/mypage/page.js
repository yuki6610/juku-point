"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import RotatingAvatar from "@/components/RotatingAvatar";
import "./mypage.css";

/* ---------------- 共通関数 ---------------- */

const getSeasonBackground = () =>
  "radial-gradient(circle at 20% 20%, #e0f2fe 0%, #f8fafc 100%)";

const getSeasonImage = () => {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return "/season/spring.jpg";
  if (m >= 6 && m <= 8) return "/season/summer.jpg";
  if (m >= 9 && m <= 11) return "/season/autumn.jpg";
  return "/season/winter.jpg";
};

/* ---------------- コンポーネント ---------------- */

export default function MyPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  const [levelUpVisible, setLevelUpVisible] = useState(false);
  const [titleName, setTitleName] = useState("");

  /* ---------- 出禁自動解除 ---------- */
  const autoUnbanIfExpired = async (uid, userData) => {
    if (!userData.banUntil) return;

    const now = new Date();
    const end = userData.banUntil.toDate
      ? userData.banUntil.toDate()
      : userData.banUntil;

    if (now > end) {
      await updateDoc(doc(db, "users", uid), {
        isBanned: false,
        banUntil: null,
      });
    }
  };

  /* ---------- 初期処理 ---------- */
  useEffect(() => {
    const auth = getAuth();

    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(timeoutId);

      if (!currentUser) {
        setLoading(false);
        router.push("/login");
        return;
      }

      setUser(currentUser);

      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        if (snap.exists()) {
          const d = snap.data();
          await autoUnbanIfExpired(currentUser.uid, d);
          setData(d);

          if (d.currentTitle) {
            const tSnap = await getDoc(doc(db, "titles", d.currentTitle));
            if (tSnap.exists()) {
              setTitleName(tSnap.data().name || "");
            }
          }

          const lastLevel = parseInt(localStorage.getItem("lastLevel") || "0");
          if ((d.level ?? 1) > lastLevel) {
            setLevelUpVisible(true);
            setTimeout(() => setLevelUpVisible(false), 1800);
          }
          localStorage.setItem("lastLevel", d.level ?? 1);
        }
      } catch (e) {
        console.error(e);
      }

      setLoading(false);
    });

    return () => {
      clearTimeout(timeoutId);
      unsub();
    };
  }, [router]);

  if (loading) return <p className="loading-text">読み込み中...</p>;
  if (!user) return null;

  const level = data.level ?? 1;
  const points = data.points ?? 0;
  const exp = data.experience ?? 0;
  const expNeeded = 100 + (level - 1) * 10;
  const expPercent = Math.min((exp / expNeeded) * 100, 100);

  return (
    <div className="mypage-container" style={{ background: getSeasonBackground() }}>
      <AnimatePresence>
        {levelUpVisible && (
          <motion.div className="levelup-banner">🎉 LEVEL UP!</motion.div>
        )}
      </AnimatePresence>

      {data.isBanned && data.banUntil && (
        <div className="ban-warning">
          🚫 自習室出禁<br />
          解除日：
          {new Date(
            data.banUntil.toDate?.() || data.banUntil
          ).toLocaleDateString()}
        </div>
      )}

      {data.yellowCard > 0 && (
        <div className="yellowcard-box">
          ⚠️ イエローカード<br />
          次に見かけたら出禁になります。
        </div>
      )}

          <div className="avatar-name-outside">
            {titleName ? `${titleName}${data.displayName}` : data.displayName}
          </div>

          
          <div
            className="avatar-frame"
            style={{
              backgroundImage: `url(${getSeasonImage()})`,
              height: "320px",
            }}
          >
          
          <Canvas camera={{ position: [0, 1.35, 2.2] }} style={{ pointerEvents: "none" }}>
            <ambientLight intensity={1.4} />
            <directionalLight position={[3, 5, 2]} intensity={1.2} />
            <Suspense fallback={null}>
              <RotatingAvatar
                url={data.avatarUrl}
                position={[0, 1, 0]}
                scale={1.5}
              />
            </Suspense>
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
          </Canvas>
          
          </div>
          
      <div className="status-card">
        <p>🎯 レベル：{level}</p>
        <p>💎 ポイント：{points}</p>
        <div className="exp-bar">
          <div className="exp-fill" style={{ width: `${expPercent}%` }} />
        </div>
        <p className="exp-text">{exp} / {expNeeded} XP</p>
      </div>

      <div className="button-group">
        <button onClick={() => router.push("/checkin")} className="btn blue">🕒 チェックイン</button>
        <button onClick={() => router.push("/rewards")} className="btn green">🎁 景品交換</button>
        <button onClick={() => router.push("/ranking")} className="btn purple">📊 ランキング</button>
          {!(data?.grade >= 10 && data?.grade <= 12) && (
            <>
              <button onClick={() => router.push("/student/scores")} className="btn pink">
                📝 成績入力・志望校判定
              </button>

              <button onClick={() => router.push("/behavior")} className="btn teal">
                📊 生活態度
              </button>
            </>
          )}
          {/* {(data?.grade >= 10 && data?.grade <= 12) && (
            <button
            onClick={() => router.push("/universities")}
            className="btn indigo"
            >
            🎓 大学入試情報
            </button>
            )}*/}
        <button onClick={() => router.push("/points")} className="btn cyan">🅿️ ポイント履歴</button>
        <button onClick={() => router.push("/settings")} className="btn gray">⚙️ 設定</button>
        <button onClick={() => router.push("/guide")} className="btn orange">📘 アプリの使い方</button>

        <button
          className="btn red"
          onClick={async () => {
            await signOut(getAuth());
            localStorage.removeItem("lastLevel");
            router.push("/login");
          }}
        >
          🚪 ログアウト
        </button>
      </div>
    </div>
  );
}
