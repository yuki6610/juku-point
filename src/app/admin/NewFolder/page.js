"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";
import "./attend.css";

// 🎯 授業出席1回あたりのポイント（ここを変えれば調整しやすい）
const ATTENDANCE_POINT = 100;

export default function HighSchoolAttendancePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [students, setStudents] = useState([]); // 高校生リスト
  const [selectedDate, setSelectedDate] = useState(() => {
    // YYYY-MM-DD
    return new Date().toISOString().slice(0, 10);
  });

  // uid -> { attended: boolean, points: number }
  const [attendanceMap, setAttendanceMap] = useState({});

  // 🔐 管理者チェック
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const adminRef = doc(db, "admins", user.uid);
      const adminSnap = await getDoc(adminRef);

      if (!adminSnap.exists()) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      await loadHighSchoolStudents();
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  // 🧑‍🎓 高校生（grade 10,11,12）のみ取得
  const loadHighSchoolStudents = async () => {
    const q = query(
      collection(db, "users"),
      where("grade", "in", [10, 11, 12])
    );

    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({
      uid: d.id,
      ...d.data(),
    }));

    setStudents(list);
    // 日付に応じた出席状況も読み込む
    await loadAttendanceForDate(list, selectedDate);
  };

  // 📅 ある日付について出席記録を読み込む
  const loadAttendanceForDate = async (studentList, dateStr) => {
    const map = {};

    // users/{uid}/classAttendance/{YYYY-MM-DD}
    for (const s of studentList) {
      const ref = doc(db, "users", s.uid, "classAttendance", dateStr);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        map[s.uid] = {
          attended: !!data.attended,
          points: data.points ?? ATTENDANCE_POINT,
        };
      } else {
        map[s.uid] = {
          attended: false,
          points: ATTENDANCE_POINT,
        };
      }
    }

    setAttendanceMap(map);
  };

  // 📆 日付変更時
  const handleDateChange = async (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);

    if (students.length > 0) {
      await loadAttendanceForDate(students, newDate);
    }
  };

  // ✅ 授業出席にポイント付与
  const handleMarkAttendance = async (student) => {
    if (!selectedDate) {
      alert("日付を選択してください。");
      return;
    }

    const uid = student.uid;
    const current = attendanceMap[uid];

    // すでに出席済みなら二重付与防止（確認付きで再付与可能）
    if (current?.attended) {
      const ok = confirm(
        `${student.realName || student.displayName || "この生徒"}は既に「出席済み」です。\nポイントを再付与しますか？`
      );
      if (!ok) return;
    }

    const attendanceRef = doc(
      db,
      "users",
      uid,
      "classAttendance",
      selectedDate
    );
    const userRef = doc(db, "users", uid);

    // 🔹 1) 出席ドキュメント更新（存在しなければ新規）
    await setDoc(
      attendanceRef,
      {
        attended: true,
        date: selectedDate,
        points: ATTENDANCE_POINT,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // 🔹 2) ユーザのポイントと授業出席回数カウント
    await updateDoc(userRef, {
      points: increment(ATTENDANCE_POINT),
      classAttendanceCount: increment(1),
    });

    // 🔹 3) ポイント履歴追加
    await addDoc(collection(db, "users", uid, "pointHistory"), {
      type: "classAttendance",
      amount: ATTENDANCE_POINT,
      note: `授業出席 (${selectedDate})`,
      createdAt: serverTimestamp(),
    });

    // 🔹 4) 画面の状態更新
    setAttendanceMap((prev) => ({
      ...prev,
      [uid]: {
        attended: true,
        points: ATTENDANCE_POINT,
      },
    }));

    alert(
      `${student.realName || student.displayName || "生徒"}に ${ATTENDANCE_POINT}pt を付与しました。`
    );
  };

  if (loading) {
    return <p style={{ padding: "16px" }}>読み込み中...</p>;
  }

  if (!isAdmin) {
    return (
      <p style={{ padding: "16px" }}>
        アクセス権がありません。（管理者アカウントでログインしてください）
      </p>
    );
  }

  return (
    <div className="hsatt-container">
      <h1 className="hsatt-title">🎓 高校生・授業出席ポイント</h1>

      {/* 日付選択 */}
      <div className="hsatt-date-box">
        <span className="hsatt-date-label">📅 対象日</span>
        <input
          type="date"
          value={selectedDate}
          onChange={handleDateChange}
          className="hsatt-date-input"
        />
      </div>

      {/* 生徒一覧 */}
      <div className="hsatt-table">
        <div className="hsatt-header">
          <div>名前</div>
          <div>学年</div>
          <div>ステータス</div>
          <div>操作</div>
        </div>

        {students.map((s) => {
          const att = attendanceMap[s.uid];

          return (
            <div key={s.uid} className="hsatt-row">
              <div className="hsatt-cell-name" data-label="名前">
                {s.realName || s.displayName}
              </div>
              <div data-label="学年">{s.grade}</div>
              <div data-label="ステータス">
                {att?.attended ? (
                  <span className="hsatt-status-done">出席済み</span>
                ) : (
                  <span className="hsatt-status-pending">未入力</span>
                )}
              </div>
              <div className="hsatt-cell-actions" data-label="操作">
                <button
                  onClick={() => handleMarkAttendance(s)}
                  className="hsatt-btn"
                >
                  {att?.attended ? "再付与" : "出席＋pt"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => router.push("/admin")} className="hsatt-back-btn">
        ← 管理ページへ戻る
      </button>
    </div>
  );
}
