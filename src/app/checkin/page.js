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
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import "./checkin.css";
import { updateExperience } from "../utils/updateExperience";
import { getCurrentSeason } from "../utils/season";

// ---- 今日ID yyyy-mm-dd ----
const getTodayId = () => {
  const now = new Date();
  now.setHours(now.getHours() + 9);
  return now.toISOString().slice(0, 10);
};

// ---- 座標 ----
const JUKU_LAT = 34.645149;
const JUKU_LNG = 135.057465;
const ALLOW_DISTANCE_M = 100;

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

const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation_unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });

export default function CheckinPage() {
  const [pin, setPin] = useState("");
  const [warning, setWarning] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [todayMinutes, setTodayMinutes] = useState(0);

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
      const ref = doc(db, `users/${user.uid}/checkins/${todayId}`);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const checkin = snap.data();
        setSessionActive(Boolean(checkin.currentSessionActive));
        setTodayMinutes(
          (checkin.sessions || []).reduce(
            (total, session) => total + Number(session.minutes || 0),
            0
          )
        );
      }
      if (snap.exists() && snap.data().currentSessionActive) {
        setWarning("自習を終了していません");
      }
    };
    fn();
  }, []);

  const appendPin = (n) =>
    setPin((prev) => (prev.length < 8 ? prev + String(n) : prev));
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
      time: serverTimestamp(),
    });
  };

    // ---------------------------------------------------
    // 🔵 メイン処理：PIN 判定（入室 / 退出）
    // ---------------------------------------------------
    const handleCheck = async () => {
      if (processing) return;
      const user = auth.currentUser;
      if (!user) {
        alert("ログインしてください");
        return;
      }

      setProcessing(true);
      const todayId = getTodayId();
      const checkRef = doc(db, `users/${user.uid}/checkins/${todayId}`);
      const now = new Date();

        // 管理画面で設定された PIN を取得
        const pinRef = doc(db, "admin_data/checkin");
        let pinSnap;
        try {
          pinSnap = await getDoc(pinRef);
        } catch (error) {
          console.error("PIN設定の取得に失敗しました:", error);
          alert("PIN設定を取得できませんでした。通信状態を確認してください。");
          setProcessing(false);
          return;
        }

        const enterPin = pinSnap.exists() ? pinSnap.data().enterPin : "1111";
        const exitPin = pinSnap.exists() ? pinSnap.data().exitPin : "0000";

      // ---------------------------------------------------
      // 🔵 入室処理
      // ---------------------------------------------------
        if (pin === enterPin) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;

              const dist = getDistanceM(lat, lng, JUKU_LAT, JUKU_LNG);
              if (dist > ALLOW_DISTANCE_M) {
                alert("不正を検知しました。logを保存します。");
                await logIllegal(user.uid, lat, lng, "enter");
                setProcessing(false);
                return;
              }

              const snap = await getDoc(checkRef);
              const nowMs = now.getTime();

              if (!snap.exists()) {
                // 初回
                await setDoc(checkRef, {
                  currentSessionActive: true,
                  enterAt: nowMs,
                  lastEnterAt: nowMs,
                  sessions: [],
                });
              } else {
                // 2回目以降
                await updateDoc(checkRef, {
                  currentSessionActive: true,
                  enterAt: nowMs,
                  lastEnterAt: nowMs,
                });
              }

              alert("自習を開始しました");
              setPin("");
              setProcessing(false);
              router.push("/mypage");
            },

            // 🔴 追加する部分（これが重要）
            async (err) => {
              console.error("GPS error:", err);

              alert("位置情報が取得できません。\n設定で位置情報をONにしてください。");

              await logIllegal(user.uid, null, null, "gps_error");
              setProcessing(false);
            },

            // ⭐ 精度オプション（おすすめ）
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            }
          );

          return;
        }

    // ---------------------------------------------------
    // 🔴 退出処理
    // ---------------------------------------------------
    if (pin === exitPin) {
      const snap = await getDoc(checkRef);

      if (!snap.exists() || !snap.data().currentSessionActive) {
        alert("自習開始記録がありません");
        setProcessing(false);
        return;
      }

      let exitLocation = null;
      let exitWarning = "";
      try {
        const pos = await getCurrentPosition();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const dist = getDistanceM(lat, lng, JUKU_LAT, JUKU_LNG);
        exitLocation = { lat, lng, distanceM: Math.round(dist) };
        if (dist > ALLOW_DISTANCE_M) {
          exitWarning = `現在地が教室から約${Math.round(dist)}m離れています。不正ログに記録しました。`;
          await logIllegal(user.uid, lat, lng, "exit");
        }
      } catch (error) {
        console.error("Exit GPS error:", error);
        exitWarning = "退出時の位置情報を取得できませんでした。不正ログに記録しました。";
        await logIllegal(user.uid, null, null, "gps_error_exit");
      }

      const data = snap.data();
      const enterAt = data.lastEnterAt;
      const exitAt = now.getTime();
      const minutes = Math.floor((exitAt - enterAt) / 60000);

      const newSession = { enterAt, exitAt, minutes, exitLocation };
      const updatedSessions = [...(data.sessions || []), newSession];

      await updateDoc(checkRef, {
        sessions: updatedSessions,
        currentSessionActive: false,
        exitAt: exitAt,
        lastExitLocation: exitLocation,
      });

      // ランキング更新
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        selfStudyCount: increment(1),
        totalStudyMinutes: increment(minutes),
          
          termSelfStudyCount: increment(1),
          termStudyMinutes: increment(minutes),
      });

      // XP / pt 計算
      const xpGain = Math.floor(minutes / 10) * 5;
      const ptGain = Math.floor(minutes / 10) * 5;

      await updateExperience(user.uid, xpGain, "selfStudy", ptGain);

      await addDoc(collection(db, "users", user.uid, "pointHistory"), {
        type: "selfstudy",
        amount: ptGain,
        note: `自習 ${minutes} 分`,
        seasonId: getCurrentSeason().id,
        createdAt: serverTimestamp(),
      });

      alert(`${exitWarning ? `${exitWarning}\n` : ""}自習終了（${minutes}分）`);
      setProcessing(false);
      router.push("/mypage");
      return;
    }

    // ---------------------------------------------------
    // ❌ PIN 不一致
    // ---------------------------------------------------
    alert("PINが間違っています");
    setProcessing(false);
  };

  return (
    <main className="checkin-shell">
    <div className="checkin-container">
      {warning && <div className="warning-box">{warning}</div>}

      <div className="checkin-heading">
        <span>SELF STUDY</span>
        <h1 className="checkin-title">自習を記録</h1>
        <p>教室に表示されているPINを入力してください。</p>
      </div>

      <div className="checkin-workspace">
        <section className={`checkin-status ${sessionActive ? "is-active" : ""}`}>
          <span className="status-dot" />
          <small>CURRENT STATUS</small>
          <strong>{sessionActive ? "自習中" : "未入室"}</strong>
          <p>
            {sessionActive
              ? "退出すると学習時間とポイントが記録されます。"
              : "教室の入室PINを入力して学習を始めましょう。"}
          </p>
          <div>
            <span>今日の記録</span>
            <b>{todayMinutes}<small>分</small></b>
          </div>
        </section>

        <section className="pin-panel">
          <div className="pin-guide">
            <strong>{sessionActive ? "退出PINを入力" : "入室PINを入力"}</strong>
            <small>{pin.length}/8桁</small>
          </div>
          <div className="pin-display" aria-label={`${pin.length}桁入力済み`}>
            {pin ? pin.replace(/./g, "●") : <span>PIN</span>}
          </div>

          <div className="keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} className="key-btn" onClick={() => appendPin(n)}>
                {n}
              </button>
            ))}
            <button className="key-btn" onClick={deletePin} aria-label="1文字削除">←</button>
            <button className="key-btn" onClick={() => appendPin(0)}>0</button>
            <button className="key-btn ok-btn" onClick={handleCheck} disabled={processing || !pin}>
              {processing ? "…" : "決定"}
            </button>
          </div>
        </section>
      </div>
    </div>
    </main>
  );
}
