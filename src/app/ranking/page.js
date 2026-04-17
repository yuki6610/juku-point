"use client";

import { useEffect, useState } from "react";
import { db } from "../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import "./ranking.css";

export default function RankingPage() {
  const [users, setUsers] = useState([]);
  const [category, setCategory] = useState("points");
  const [grade, setGrade] = useState("all"); // ⭐ 学年フィルタ追加
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRanking();
  }, [category]);

  const fetchRanking = async () => {
    setLoading(true);

    // 🔹 全ユーザー取得
    const snap = await getDocs(collection(db, "users"));
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 🔹 管理者を除外
    const adminsSnap = await getDocs(collection(db, "admins"));
    const adminIds = new Set(adminsSnap.docs.map((d) => d.id));
    list = list.filter((u) => !adminIds.has(u.id));

    // 🔹 全称号データ取得
    const titlesSnap = await getDocs(collection(db, "titles"));
    const titles = {};
    titlesSnap.forEach((d) => {
      titles[d.id] = d.data().name;
    });

    // 🔹 ユーザー名＋称号
    list = list.map((u) => {
      const titleId = u.currentTitle;
      const titleName = titleId ? titles[titleId] : "";
      const newName = titleName ? `${titleName}${u.displayName}` : u.displayName;

      return { ...u, _displayNameWithTitle: newName };
    });

    // ▼ カテゴリ別並び替え
    switch (category) {
      case "points":
        list.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
        break;

      case "level":
        list.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
        break;

      case "studyHours":
        list.forEach((u) => {
          u._periodStudyHours = (u.totalStudyMinutes ?? 0) / 60;
        });
        list.sort(
          (a, b) => (b._periodStudyHours ?? 0) - (a._periodStudyHours ?? 0)
        );
        break;

      case "wordTotal":
        list.sort(
          (a, b) => (b.totalWordTestScore ?? 0) - (a.totalWordTestScore ?? 0)
        );
        break;

      case "selfStudyCount":
        list.sort((a, b) => (b.selfStudyCount ?? 0) - (a.selfStudyCount ?? 0));
        break;

      case "homeworkCount":
        list.sort((a, b) => (b.homeworkCount ?? 0) - (a.homeworkCount ?? 0));
        break;

        case "rewardsCount":
          list.forEach((u) => {
            u._rewardCount = Array.isArray(u.rewardHistory)
              ? u.rewardHistory.length
              : 0;
          });

          list.sort((a, b) => (b._rewardCount ?? 0) - (a._rewardCount ?? 0));
          break;

      default:
        break;
    }

    setUsers(list);
    setLoading(false);
  };

  // 🔹 学年フィルタ適用
    const filteredUsers = users
      .filter((u) => {
        // 学年フィルタ
        if (grade !== "all" && u.grade !== grade) return false;

        // ⭐ 単語テストのときだけ高校生を除外
        if (category === "wordTotal" && u.grade >= 10) return false;

        return true;
      });
  // 上位3名の色
  const getRankClass = (rank) => {
    if (rank === 0) return "rank-gold";
    if (rank === 1) return "rank-silver";
    if (rank === 2) return "rank-bronze";
    return "";
  };

  const getCrown = (rank) => {
    if (rank === 0) return "🥇";
    if (rank === 1) return "🥈";
    if (rank === 2) return "🥉";
    return "";
  };

  const displayValue = (u) => {
    switch (category) {
      case "points":
        return `${u.points ?? 0} Pt`;
      case "level":
        return `Lv.${u.level ?? 0}`;
      case "studyHours":
        return `${(u._periodStudyHours ?? 0).toFixed(2)} h`;
      case "wordTotal":
        return `${u.totalWordTestScore ?? 0} 点`;
      case "selfStudyCount":
        return `${u.selfStudyCount ?? 0} 回`;
      case "homeworkCount":
        return `${u.homeworkCount ?? 0} 回`;
      case "rewardsCount":
        return `${u._rewardCount ?? 0} 回`;
      default:
        return "";
    }
  };

  return (
    <div className="ranking-wrapper">
      <div className="ranking-card">
        <h1 className="ranking-title">🏆 ランキング</h1>

          {/* ⭐ 学年フィルタ */}
          <div className="ranking-tabs" style={{ marginBottom: "16px" }}>
            <button
              className={grade === "all" ? "active" : ""}
              onClick={() => setGrade("all")}
            >
              全学年
            </button>

            <button
              className={grade === 7 ? "active" : ""}
              onClick={() => setGrade(7)}
            >
              中1
            </button>

            <button
              className={grade === 8 ? "active" : ""}
              onClick={() => setGrade(8)}
            >
              中2
            </button>

            <button
              className={grade === 9 ? "active" : ""}
              onClick={() => setGrade(9)}
            >
              中3
            </button>
          </div>

          {/* ▼ カテゴリ切り替え（←これ追加！） */}
          <div className="ranking-tabs">
            <button
              className={category === "level" ? "active" : ""}
              onClick={() => setCategory("level")}
            >
              📈 レベル
            </button>

            <button
              className={category === "points" ? "active" : ""}
              onClick={() => setCategory("points")}
            >
              💎 ポイント
            </button>

            <button
              className={category === "selfStudyCount" ? "active" : ""}
              onClick={() => setCategory("selfStudyCount")}
            >
              📘 累計自習回数
            </button>

            <button
              className={category === "studyHours" ? "active" : ""}
              onClick={() => setCategory("studyHours")}
            >
              ⏱ 総自習時間
            </button>

            <button
              className={category === "wordTotal" ? "active" : ""}
              onClick={() => setCategory("wordTotal")}
            >
              ✏️ 単語テスト総得点
            </button>

            <button
              className={category === "rewardsCount" ? "active" : ""}
              onClick={() => setCategory("rewardsCount")}
            >
              🎁 景品交換回数
            </button>
          </div>

                  {loading ? (
                    <p>読み込み中...</p>
                  ) : (
                    <div className="ranking-list">
                      {filteredUsers.map((u, index) => (
                        <div key={u.id} className={`ranking-row ${getRankClass(index)}`}>
                          <div className="ranking-left">
                            <div className="rank-number">
                              {index + 1} {getCrown(index)}
                            </div>
                            <div className="rank-name">
                              {u._displayNameWithTitle ?? "不明"}
                            </div>
                          </div>
                          <div className="ranking-value">{displayValue(u)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                    </div>
                    
      <button
        className="back-btn"
        onClick={() => (window.location.href = "/mypage")}
      >
        マイページへ戻る
      </button>
    </div>
  );
}
