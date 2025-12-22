"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebaseConfig";
import {
  onAuthStateChanged,
} from "firebase/auth";
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

// 🎯 ガチャ1回の消費ポイント
const GACHA_COST = 200;

export default function GachaPage() {
  const router = useRouter();
  const [userState, setUserState] = useState({
    uid: null,
    points: 0,
    loading: true,
  });

  const [items, setItems] = useState([]);        // ガチャ景品候補
  const [rolling, setRolling] = useState(false); // ガチャ中フラグ
  const [result, setResult] = useState(null);    // 出た景品
  const [error, setError] = useState("");

  // 🔐 ログイン＆ユーザー情報取得
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      let points = 0;
      if (userSnap.exists()) {
        const data = userSnap.data();
        points = data.points ?? 0;
      }

      setUserState({
        uid: user.uid,
        points,
        loading: false,
      });

      // ガチャ景品リストを読み込み
      await loadGachaItems();
    });

    return () => unsub();
  }, [router]);

  // 🎁 ガチャ景品を読み込み
  const loadGachaItems = async () => {
    const snap = await getDocs(collection(db, "gachaItems"));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // weight > 0 のものだけ対象
    const filtered = list.filter((item) => (item.weight ?? 0) > 0);

    setItems(filtered);
  };

  // 🎲 重み付きランダム抽選
  const pickRandomItem = (list) => {
    const totalWeight = list.reduce((sum, item) => sum + (item.weight ?? 0), 0);
    const r = Math.random() * totalWeight;

    let acc = 0;
    for (const item of list) {
      acc += item.weight ?? 0;
      if (r <= acc) return item;
    }
    // 保険で最後のやつ
    return list[list.length - 1];
  };

  // ▶ ガチャを回す
  const handleRoll = async () => {
    setError("");

    if (rolling) return;

    if (userState.loading || !userState.uid) {
      setError("ユーザー情報を読み込み中です。");
      return;
    }

    if (userState.points < GACHA_COST) {
      setError(`ポイントが足りません。（必要：${GACHA_COST}pt）`);
      return;
    }

    if (items.length === 0) {
      setError("ガチャ景品が設定されていません。先生に聞いてください。");
      return;
    }

    setRolling(true);

    try {
      // 1. 抽選
      const prize = pickRandomItem(items);

      // 2. ユーザーポイント減算
      const userRef = doc(db, "users", userState.uid);
      await updateDoc(userRef, {
        points: increment(-GACHA_COST),
      });

      // 3. ポイント履歴に記録（消費）
      await addDoc(collection(db, "users", userState.uid, "pointHistory"), {
        type: "gacha",
        amount: -GACHA_COST,
        note: `ガチャ１回（${prize.name}）`,
        createdAt: serverTimestamp(),
      });

      // 4. ガチャ結果の履歴（任意）
      await addDoc(collection(db, "users", userState.uid, "gachaHistory"), {
        prizeId: prize.id,
        prizeName: prize.name,
        rarity: prize.rarity ?? "",
        createdAt: serverTimestamp(),
      });

      // 5. 在庫があるなら減らす（-1なら無限扱いでもOK）
      if (typeof prize.stock === "number" && prize.stock > 0) {
        const prizeRef = doc(db, "gachaItems", prize.id);
        await updateDoc(prizeRef, {
          stock: increment(-1),
        });
      }

      // 6. 画面状態更新
      setUserState((prev) => ({
        ...prev,
        points: prev.points - GACHA_COST,
      }));
      setResult(prize);
    } catch (e) {
      console.error(e);
      setError("エラーが発生しました。時間をおいてもう一度お試しください。");
    } finally {
      setRolling(false);
    }
  };

  if (userState.loading) {
    return <div style={{ padding: "16px" }}>読み込み中...</div>;
  }

  return (
    <div className="gacha-container">
      <h1 className="gacha-title">🎰 ガチャ</h1>

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

      {result && (
        <div className="gacha-result">
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
