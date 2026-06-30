"use client";

import { useEffect, useState } from "react";
import { db } from "../../firebaseConfig";
import {
  collection,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import { getCurrentSeason } from "../utils/season";
import "./ranking.css";

export default function RankingPage() {
  const [users, setUsers] = useState([]);
  const [category, setCategory] = useState("points");
  const [grade, setGrade] = useState("all"); // ⭐ 学年フィルタ追加
  const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState("term");
    const [hallOfFame, setHallOfFame] = useState(null);

  useEffect(() => {
    fetchRanking();
  }, [category, mode, grade]);

    const fetchRanking = async () => {
      setLoading(true);
        
        const currentSeason = getCurrentSeason();
      // ----------------------------
      // 前学期TOP3取得
      // ----------------------------
      let previousSeason = "";

      const [year, term] = currentSeason.id.split("_");

      if (term === "1") {
        previousSeason = `${Number(year) - 1}_3`;
      } else {
        previousSeason = `${year}-${Number(term) - 1}`;
      }

      const hallSnap = await getDoc(doc(db, "hallOfFame", previousSeason));

      if (hallSnap.exists()) {
        setHallOfFame(hallSnap.data());
      } else {
        setHallOfFame(null);
      }

      // ----------------------------
      // 全ユーザー取得
      // ----------------------------
      const snap = await getDocs(collection(db, "users"));
      let list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // ----------------------------
      // 管理者除外
      // ----------------------------
      const adminsSnap = await getDocs(collection(db, "admins"));
      const adminIds = new Set(adminsSnap.docs.map((d) => d.id));

      list = list.filter((u) => !adminIds.has(u.id));

      // ----------------------------
      // 並び替え
      // ----------------------------
      switch (category) {
        case "points":
          list.sort((a, b) =>
            mode === "term"
              ? (b.termPoints ?? 0) - (a.termPoints ?? 0)
              : (b.points ?? 0) - (a.points ?? 0)
          );
          break;

        case "level":
          list.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
          break;

        case "studyHours":
          list.forEach((u) => {
            u._periodStudyHours =
              mode === "term"
                ? (u.termStudyMinutes ?? 0) / 60
                : (u.totalStudyMinutes ?? 0) / 60;
          });

          list.sort(
            (a, b) => (b._periodStudyHours ?? 0) - (a._periodStudyHours ?? 0)
          );
          break;

        case "wordTotal":
          list.sort((a, b) =>
            mode === "term"
              ? (b.termWordScore ?? 0) - (a.termWordScore ?? 0)
              : (b.totalWordTestScore ?? 0) - (a.totalWordTestScore ?? 0)
          );
          break;

        case "selfStudyCount":
          list.sort((a, b) =>
            mode === "term"
              ? (b.termSelfStudyCount ?? 0) - (a.termSelfStudyCount ?? 0)
              : (b.selfStudyCount ?? 0) - (a.selfStudyCount ?? 0)
          );
          break;

        case "homeworkCount":
          list.sort((a, b) =>
            mode === "term"
              ? (b.termHomeworkCount ?? 0) - (a.termHomeworkCount ?? 0)
              : (b.homeworkCount ?? 0) - (a.homeworkCount ?? 0)
          );
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
    
    const top3 = filteredUsers.slice(0, 3);
    const hallTop3 =
      hallOfFame?.[category]?.top3 ?? [];
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
          return mode === "term"
            ? `${u.termPoints ?? 0} Pt`
            : `${u.points ?? 0} Pt`;

        case "level":
          return `Lv.${u.level ?? 0}`;

        case "studyHours":
          return `${(u._periodStudyHours ?? 0).toFixed(2)} h`;

        case "wordTotal":
          return mode === "term"
            ? `${u.termWordScore ?? 0} 点`
            : `${u.totalWordTestScore ?? 0} 点`;

        case "selfStudyCount":
          return mode === "term"
            ? `${u.termSelfStudyCount ?? 0} 回`
            : `${u.selfStudyCount ?? 0} 回`;

        case "homeworkCount":
          return mode === "term"
            ? `${u.termHomeworkCount ?? 0} 回`
            : `${u.homeworkCount ?? 0} 回`;

        case "rewardsCount":
          return `${u._rewardCount ?? 0} 回`;

        default:
          return "";
      }
    };
    
    const hallUnit = () => {

      switch (category) {

        case "points":

          return "Pt";

        case "studyHours":

          return "h";

        case "wordTotal":

          return "点";

        case "selfStudyCount":

          return "回";

        case "homeworkCount":

          return "回";

        case "rewardsCount":

          return "回";

        default:

          return "";

      }

    };

    return (
      <div className="ranking-wrapper">
        <div className="ranking-card">
          <h1 className="ranking-title">🏆 ランキング</h1>

          <div className="ranking-tabs">
            <button
              className={mode === "term" ? "active" : ""}
              onClick={() => setMode("term")}
            >
              📅 今学期
            </button>

            <button
              className={mode === "total" ? "active" : ""}
              onClick={() => setMode("total")}
            >
              🏆 累計
            </button>
          </div>

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
              {mode === "term" ? "📘 自習回数" : "📘 累計自習回数"}
            </button>

            <button
              className={category === "studyHours" ? "active" : ""}
              onClick={() => setCategory("studyHours")}
            >
              {mode === "term" ? "⏱ 自習時間" : "⏱ 総自習時間"}
            </button>

            <button
              className={category === "wordTotal" ? "active" : ""}
              onClick={() => setCategory("wordTotal")}
            >
              {mode === "term" ? "✏️ 単語得点" : "✏️ 単語テスト総得点"}
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
            <>
              {mode === "term" && grade === "all" && (
                hallOfFame ? (
                  <div className="hall-card">
                    <h2>👑 前学期 TOP3</h2>

                    <div className="hall-podium">
                      <div className="hall-second">
                        {hallTop3[1] && (
                          <>
                            <div className="hall-medal">🥈</div>
                            <div className="hall-name">{hallTop3[1].displayName}</div>
                                         <div className="hall-score">
                                           {category === "studyHours"
                                             ? `${(hallTop3[1].points / 60).toFixed(2)} h`
                                             : `${hallTop3[1].points} ${hallUnit()}`}
                                         </div>
                          </>
                        )}
                      </div>

                      <div className="hall-first">
                        {hallTop3[0] && (
                          <>
                            <div className="hall-medal">🥇</div>
                            <div className="hall-name">{hallTop3[0].displayName}</div>
                                         <div className="hall-score">
                                           {category === "studyHours"
                                             ? `${(hallTop3[0].points / 60).toFixed(2)} h`
                                             : `${hallTop3[0].points} ${hallUnit()}`}
                                         </div>
                          </>
                        )}
                      </div>

                      <div className="hall-third">
                        {hallTop3[2] && (
                          <>
                            <div className="hall-medal">🥉</div>
                            <div className="hall-name">{hallTop3[2].displayName}</div>
                                         <div className="hall-score">
                                           {category === "studyHours"
                                             ? `${(hallTop3[2].points / 60).toFixed(2)} h`
                                             : `${hallTop3[2].points} ${hallUnit()}`}
                                         </div>
                                         </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="hall-card">
                    <h2>👑 前学期 TOP3</h2>
                    <p style={{ textAlign: "center" }}>
                      前学期データはまだありません。
                    </p>
                  </div>
                )
              )}

              <div className="top3-container">
                {top3.map((u, index) => (
                  <div
                    key={u.id}
                    className={`top-card top${index + 1}`}
                  >
                    <div className="top-crown">
                      {getCrown(index)}
                    </div>

                    <div className="top-name">
                      {u.displayName ?? "不明"}
                    </div>

                    <div className="top-score">
                      {displayValue(u)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="ranking-list">
                {filteredUsers.slice(3).map((u, index) => (
                  <div
                    key={u.id}
                    className={`ranking-row ${getRankClass(index + 3)}`}
                  >
                    <div className="ranking-left">
                      <div className="rank-number">
                        {index + 4}
                      </div>

                      <div className="rank-name">
                        {u.displayName ?? "不明"}
                      </div>
                    </div>

                    <div className="ranking-value">
                      {displayValue(u)}
                    </div>
                  </div>
                ))}
              </div>
            </>
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
