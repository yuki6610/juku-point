"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { app } from "../../firebaseApp";
import { getCurrentSeason } from "../utils/season";
import "./ranking.css";

const auth = getAuth(app);
const PUBLIC_FIELDS = [
  "displayName",
  "grade",
  "level",
  "termPoints",
  "points",
  "totalEarnedPoints",
  "termStudyMinutes",
  "totalStudyMinutes",
  "termWordScore",
  "totalWordTestScore",
  "termSelfStudyCount",
  "selfStudyCount",
  "termHomeworkCount",
  "homeworkCount",
  "termRewardsCount",
];

export default function RankingPage() {
  const [users, setUsers] = useState([]);
  const [category, setCategory] = useState("points");
  const [grade, setGrade] = useState("all"); // ⭐ 学年フィルタ追加
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
    const [mode, setMode] = useState("term");
    const [hallOfFame, setHallOfFame] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUsers([]);
        setLoading(false);
        setError("ランキングを見るにはログインしてください。");
        return;
      }
      fetchRanking(currentUser);
    });

    return unsubscribe;
  }, []);

    const fetchRanking = async (currentUser = auth.currentUser) => {
      setLoading(true);
      setError("");
      try {
        
        const currentSeason = getCurrentSeason();
      // ----------------------------
      // 前学期TOP3取得
      // ----------------------------
      let previousSeason = "";

      const [year, term] = currentSeason.id.split("_");

      if (term === "1") {
        previousSeason = `${Number(year) - 1}_3`;
      } else {
        previousSeason = `${year}_${Number(term) - 1}`;
      }

      if (!currentUser) throw new Error("ログインが必要です。");
      const token = await currentUser.getIdToken();
      let result;
      let response;
      try {
        response = await fetch(
          `/api/ranking?previousSeason=${encodeURIComponent(previousSeason)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {
        result = await fetchRankingFromFirestore(previousSeason);
      }
      if (response) {
        const apiResult = await response.json().catch(() => ({}));
        if (response.ok) {
          result = apiResult;
        } else if (response.status === 401 || response.status === 403) {
          throw new Error(apiResult.error || "ログイン情報を確認できませんでした。");
        } else {
          result = await fetchRankingFromFirestore(previousSeason);
        }
      }
      setHallOfFame(result.hallOfFame);
      setUsers(result.users || []);
      } catch (e) {
        setError(e.message || "ランキングを取得できませんでした。");
      } finally {
        setLoading(false);
      }
    };

    const fetchRankingFromFirestore = async (previousSeason) => {
      const {
        collection,
        doc,
        getDoc,
        getDocs,
        getFirestore,
      } = await import("firebase/firestore");
      const clientDb = getFirestore(app);
      const usersSnap = await getDocs(collection(clientDb, "users"));
      let adminIds = new Set();
      let hallOfFame = null;

      try {
        const adminsSnap = await getDocs(collection(clientDb, "admins"));
        adminIds = new Set(adminsSnap.docs.map((snapshot) => snapshot.id));
      } catch {
        // 管理者一覧が非公開でも、生徒ランキング自体の取得は継続する。
      }
      if (previousSeason) {
        try {
          const hallSnap = await getDoc(
            doc(clientDb, "hallOfFame", previousSeason),
          );
          hallOfFame = hallSnap.exists() ? hallSnap.data() : null;
        } catch {
          // 前学期データが非公開でも、今学期ランキングは表示する。
        }
      }

      const fallbackUsers = usersSnap.docs
        .filter((snapshot) => {
          const source = snapshot.data();
          return (
            !adminIds.has(snapshot.id) &&
            source.role !== "admin" &&
            source.isAdmin !== true
          );
        })
        .map((snapshot) => {
          const source = snapshot.data();
          const user = { id: snapshot.id };
          for (const field of PUBLIC_FIELDS) user[field] = source[field] ?? null;
          user.rewardCount = Array.isArray(source.rewardHistory)
            ? source.rewardHistory.length
            : 0;
          return user;
        });

      return {
        users: fallbackUsers,
        hallOfFame,
      };
    };

    const rankedUsers = useMemo(() => {
      const list = users.map((user) => ({ ...user }));

      switch (category) {
        case "points":
          list.sort((a, b) =>
            mode === "term"
              ? (b.termPoints ?? 0) - (a.termPoints ?? 0)
              : (b.totalEarnedPoints ?? 0) -
                (a.totalEarnedPoints ?? 0)
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
            u._rewardCount =
              mode === "term" ? (u.termRewardsCount ?? 0) : (u.rewardCount ?? 0);
          });

          list.sort((a, b) => (b._rewardCount ?? 0) - (a._rewardCount ?? 0));
          break;

        default:
          break;
      }

      return list;
    }, [users, category, mode]);

  // 🔹 学年フィルタ適用
    const filteredUsers = rankedUsers
      .filter((u) => {
        // 学年フィルタ
        if (grade !== "all" && Number(u.grade) !== Number(grade)) return false;

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
            : `${u.totalEarnedPoints ?? 0} Pt`;

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
          <header className="ranking-heading">
            <span>LEADERBOARD</span>
            <h1 className="ranking-title">みんなのランキング</h1>
            <p>積み重ねた学習の成果をカテゴリー別に確認できます。</p>
          </header>

          <section className="ranking-controls">
          <div className="control-label">期間</div>
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

          <div className="control-label">学年</div>
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

          <div className="control-label">カテゴリー</div>
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
          </section>

          {loading ? (
            <p className="ranking-state">ランキングを読み込んでいます…</p>
          ) : error ? (
            <div className="ranking-state error" role="alert">
              <p>{error}</p>
              {auth.currentUser && (
                <button type="button" onClick={() => fetchRanking()}>
                  もう一度読み込む
                </button>
              )}
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="ranking-state">この条件に該当するランキングはまだありません。</p>
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
