"use client";

import { useState, useEffect } from "react";
import { db } from "../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
} from "firebase/firestore";
import { historyMillis, mapInBatches } from '@/lib/historyCompatibility.mjs';
import "../qr/selfstudy.css";

const gradeLabel = (value) => {
  const grade = Number(value);
  if (grade >= 1 && grade <= 6) return `小${grade}`;
  if (grade >= 7 && grade <= 9) return `中${grade - 6}`;
  if (grade >= 10 && grade <= 12) return `高${grade - 9}`;
  return "未設定";
};

export default function SelfStudyList() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const getTodayId = () => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  useEffect(() => {
    loadSelfStudyStudents();
  }, []);

  async function loadSelfStudyStudents() {
    setLoading(true);
    setError('');
    try {
    const todayId = getTodayId();
    const users = await getDocs(collection(db, 'users'));
    const list = await mapInBatches(users.docs, async (student) => {
      const uid = student.id;
      const checkSnap = await getDoc(doc(db, 'users', uid, 'checkins', todayId));
      if (!checkSnap.exists()) return null;
      const c = checkSnap.data();
      if (c.currentSessionActive !== true) return null;
      const userData = student.data();
        const enterAt = historyMillis(c.enterAt || c.lastEnterAt);

        const enterTimeText = enterAt ? new Date(enterAt).toLocaleTimeString("ja-JP", {
          timeZone: 'Asia/Tokyo',
          hour: "2-digit",
          minute: "2-digit",
        }) : '時刻不明';

        return {
          uid,
          date: todayId,
          name: userData.realName || userData.displayName || "名前未登録",
          grade: userData.grade ?? "ー",
          enterTime: enterTimeText,
        };
    });

    setStudents(list.filter(Boolean));
    } catch (error) {
      console.error('自習中一覧の取得エラー:', error);
      setError(`自習中の生徒を取得できませんでした。再読み込みしてください。（${error.code || '通信エラー'}）`);
    } finally {
    setLoading(false);
    }
  }

  // ⭐ 強制退出（ポイント・経験値は付与しない）
  async function forceExit(uid, date) {
    setError('');
    try {
      const ref = doc(db, 'users', uid, 'checkins', date);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists() || snap.data().currentSessionActive !== true) {
          throw new Error('既に退出済みか、入室記録がありません。再読み込みしてください。');
        }
        const data = snap.data();
        const enterAt = historyMillis(data.enterAt || data.lastEnterAt);
        if (!enterAt) throw new Error('入室時刻が取得できません。記録を確認してください。');
        const now = Date.now();
        transaction.update(ref, {
          currentSessionActive: false,
          sessions: [...(Array.isArray(data.sessions) ? data.sessions : []), { enterAt, exitAt: now, forced: true, minutes: 0 }],
        });
      });
      alert('強制退出しました（ポイントは付与されません）');
      await loadSelfStudyStudents();
    } catch (error) {
      setError(error.message || '強制退出に失敗しました。再読み込みしてください。');
    }
  }

  if (loading) {
    return <div className="ss-loading">読み込み中…</div>;
  }

  return (
    <div className="ss-container">
      <h1 className="ss-title">📚 自習中の生徒一覧</h1>
      {error && <p role="alert">{error}</p>}

      {error ? null : students.length === 0 ? (
        <p className="ss-empty">現在自習している生徒はいません。</p>
      ) : (
        <table className="ss-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>学年</th>
              <th>入室時刻</th>
              <th>強制退出</th>
            </tr>
          </thead>

          <tbody>
            {students.map((s) => (
              <tr key={s.uid}>
                <td>{s.name}</td>
                <td>{gradeLabel(s.grade)}</td>
                <td>{s.enterTime}</td>
                <td>
                  <button
                    className="ss-exit-btn"
                    onClick={() => forceExit(s.uid, s.date)}
                  >
                    強制退出
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button className="ss-refresh-btn" onClick={loadSelfStudyStudents}>
        🔄 更新
      </button>
    </div>
  );
}
