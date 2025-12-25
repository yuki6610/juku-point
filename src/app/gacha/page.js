"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";

import "./gacha.css";

const GACHA_COST = 200;

export default function GachaPage() {
  const router = useRouter();

  const [userState, setUserState] = useState({
    uid: null,
    points: 0,
    loading: true,
  });

  const [items, setItems] = useState([]);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | rolling | reveal

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      const points = userSnap.exists() ? userSnap.data().points ?? 0 : 0;

      setUserState({
        uid: user.uid,
        points,
        loading: false,
      });

      await loadGachaItems();
    });

    return () => unsub();
  }, [router]);

  const loadGachaItems = async () => {
    const snap = await getDocs(collection(db, "gachaItems"));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setItems(list.filter((i) => (i.weight ?? 0) > 0));
  };

  const pickRandomItem = (list) => {
    const total = list.reduce((s, i) => s + i.weight, 0);
    let r = Math.random() * total;
    for (const item of list) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return list[list.length - 1];
  };

  const handleRoll = async () => {
    setError("");
    if (rolling || userState.points < GACHA_COST) return;

    setRolling(true);
    setPhase("rolling");
    setResult(null);

    try {
      const prize = pickRandomItem(items);

      // 🎬 演出時間（2.5秒）
      await new Promise((r) => setTimeout(r, 2500));

      // Firestore処理
      const userRef = doc(db, "users", userState.uid);
      await updateDoc(userRef, { points: increment(-GACHA_COST) });

      await addDoc(collection(db, "users", userState.uid, "pointHistory"), {
        type: "gacha",
        amount: -GACHA_COST,
        note: `ガチャ１回（${prize.name}）`,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "users", userState.uid, "gachaHistory"), {
        prizeId: prize.id,
        prizeName: prize.name,
        rarity: prize.rarity ?? "",
        createdAt: serverTimestamp(),
      });
        
        // ガチャ結果を管理者用にも保存
        await addDoc(collection(db, "admin_gacha_logs"), {
          uid: userState.uid,
          prizeId: prize.id,
          prizeName: prize.name,
          rarity: prize.rarity ?? "",
          createdAt: serverTimestamp(),
        });

      if (typeof prize.stock === "number" && prize.stock > 0) {
        await updateDoc(doc(db, "gachaItems", prize.id), {
          stock: increment(-1),
        });
      }

      setUserState((p) => ({ ...p, points: p.points - GACHA_COST }));
      setResult(prize);
      setPhase("reveal");
    } catch (e) {
      console.error(e);
      setError("エラーが発生しました。");
    } finally {
      setRolling(false);
    }
  };

  if (userState.loading) return <div style={{ padding: 16 }}>読み込み中...</div>;

  return (
    <div className="gacha-container">
      <h1 className="gacha-title">🎰 景品ガチャ</h1>

      <div className="gacha-status">
        <p>現在のポイント：<span className="gacha-points">{userState.points} pt</span></p>
        <p>1回：<span className="gacha-cost">{GACHA_COST} pt</span></p>
      </div>

      {error && <div className="gacha-error">{error}</div>}

      <button
        className="gacha-button"
        onClick={handleRoll}
        disabled={rolling || userState.points < GACHA_COST}
      >
        {rolling ? "抽選中..." : "ガチャを回す"}
      </button>

      {/* 🎬 演出レイヤー */}
      {phase === "rolling" && (
        <div className="gacha-overlay">
          <div className="gacha-spinner"></div>
          <p>抽選中…</p>
        </div>
      )}

      {result && phase === "reveal" && (
        <div className="gacha-result animate-pop">
          <h2>結果 🎉</h2>
          <p className="gacha-result-name">{result.name}</p>
          {result.rarity && (
            <p className={`gacha-rarity rarity-${result.rarity}`}>
              レアリティ：{result.rarity}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
