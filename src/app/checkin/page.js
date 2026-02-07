"use client";

import { useState, useEffect } from "react";
import { db } from "../../firebaseConfig";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  increment,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import "./checkin.css";
import { updateExperience } from "../utils/updateExperience";

// ---- 今日ID yyyy-mm-dd ----
const getTodayId = () => {
  const now = new Date();
  now.setHours(now.getHours() + 9);
  return now.toISOString().slice(0, 10);
};

// ---- 座標 ----
const JUKU_LAT = 34.645149;
const JUKU_LNG = 135.057465;
const ALLOW_DISTANCE_M = 300;

// ---- 距離計算 ----
const getDistanceM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export default function CheckinPage() {
  const [pin, setPin] = useState("");
  const [warning, setWarning] = useState(null);

  const auth = getAuth();
  const router = useRouter();

  // -----------------------------
  // 🚨 退出忘れ警告
  // -----------------------------
  useEffect(() => {
    const fn = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const todayId = getTodayId();
      const ref = doc(db, 'users/${user.uid}/checkins/${todayId}');
      const snap = await getDoc(ref);

      if (snap.exists() && snap.data().currentSessionActive) {
        setWarning("⚠ まだ退出していません");
      }
    };
    fn();
  }, []);

  const appendPin = (n) => setPin((prev) => prev + String(n));
  const deletePin = () => setPin((prev) => prev.slice(0, -1));

  // -----------------------------
  // ❗ 不正ログ
  // -----------------------------
  const logIllegal = async (uid, lat, lng, type) => {
    await addDoc(collection(db, "illegal_checkins"), {
      uid,
      type,
      lat,
      lng,
      time: new Date().toISOString(),
    });
  };

    // ---------------------------------------------------
    // 🔵 メイン処理：PIN 判定（入室 / 退出）
    // ---------------------------------------------------
    const handleCheck = async () => {
      const user = auth.currentUser;
      if (!user) {
        alert("ログインしてください");
        return;
      }

      const todayId = getTodayId();
      const checkRef = doc(db, 'users/${user.uid}/checkins/${todayId}');
      const now = new Date();

        // 管理画面で設定された PIN を取得
        const pinRef = doc(db, "admin_data/checkin");
        const pinSnap = await getDoc(pinRef);

        const enterPin = pinSnap.exists() ? pinSnap.data().enterPin : "1111";
        const exitPin = pinSnap.exists() ? pinSnap.data().exitPin : "0000";

      // ---------------------------------------------------
      // 🔵 入室処理
      // ---------------------------------------------------
      if (pin === enterPin) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          const dist = getDistanceM(lat, lng, JUKU_LAT, JUKU_LNG);
          if (dist > ALLOW_DISTANCE_M) {
            alert("不正を検知しました。logを保存します。");
            await logIllegal(user.uid, lat, lng, "enter");
            return;
          }

          const snap = await getDoc(checkRef);
          const nowMs = now.getTime();

          if (!snap.exists()) {
            // 初回入室
            await setDoc(checkRef, {
              currentSessionActive: true,
              enterAt: nowMs,
              lastEnterAt: nowMs,
              sessions: [],
            });
          } else {
            // 2 回目以降
            await updateDoc(checkRef, {
              currentSessionActive: true,
              enterAt: nowMs,
              lastEnterAt: nowMs,
            });
          }

          alert("入室しました");
          router.push("/mypage");
        });
        return;
      }

    // ---------------------------------------------------
    // 🔴 退出処理
    // ---------------------------------------------------
    if (pin === exitPin) {
      const snap = await getDoc(checkRef);

      if (!snap.exists() || !snap.data().currentSessionActive) {
        alert("入室記録がありません");
        return;
      }

      const data = snap.data();
      const enterAt = data.lastEnterAt;
      const exitAt = now.getTime();
      const minutes = Math.floor((exitAt - enterAt) / 60000);

      const newSession = { enterAt, exitAt, minutes };
      const updatedSessions = [...(data.sessions || []), newSession];

      await updateDoc(checkRef, {
        sessions: updatedSessions,
        currentSessionActive: false,
        exitAt: exitAt,
      });

      // ランキング更新
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        selfStudyCount: increment(1),
        totalStudyMinutes: increment(minutes),
      });

      // XP / pt 計算
      const xpGain = Math.floor(minutes / 10) * 5;
      const ptGain = Math.floor(minutes / 10) * 5;

      await updateExperience(user.uid, xpGain, "selfStudy", ptGain);

      await addDoc(collection(db, "users", user.uid, "pointHistory"), {
        type: "selfstudy",
        amount: ptGain,
        note: '自習 ${minutes} 分',
        createdAt: new Date(),
      });

      alert('退出しました（${minutes}分）');
      router.push("/mypage");
      return;
    }

    // ---------------------------------------------------
    // ❌ PIN 不一致
    // ---------------------------------------------------
    alert("PINが間違っています");
  };

  return (
    <div className="checkin-container">
      {warning && <div className="warning-box">{warning}</div>}

      <h1 className="checkin-title">Check-in / Check-out</h1>

      <div className="pin-display">{pin.replace(/./g, "●")}</div>

      <div className="keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} className="key-btn" onClick={() => appendPin(n)}>
            {n}
          </button>
        ))}
        <button className="key-btn" onClick={deletePin}>←</button>
        <button className="key-btn" onClick={() => appendPin(0)}>0</button>
        <button className="key-btn ok-btn" onClick={handleCheck}>OK</button>
      </div>
    </div>
  );
}

