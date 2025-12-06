"use client";

import { useEffect, useState } from "react";
import { db } from "../../firebaseConfig";
import "./titles.css";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

export default function TitlesPage() {
    const [titles, setTitles] = useState([]);
    const [earnedTitles, setEarnedTitles] = useState([]);
    const [userData, setUserData] = useState({});
    const [selectedFilter, setSelectedFilter] = useState("all");
    
    const [openGroups, setOpenGroups] = useState({});
    const [activeTab, setActiveTab] = useState("conditions");
    
    const auth = getAuth();
    const user = auth.currentUser;
    
    // --------------------------------
    // データ取得
    // --------------------------------
    useEffect(() => {
        if (!user) return;
        
        const fetchAllTitles = async () => {
            const snap = await getDocs(collection(db, "titles"));
            setTitles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        };
        
        const fetchEarnedTitles = async () => {
            const snap = await getDocs(collection(db, "users", user.uid, "titles"));
            setEarnedTitles(snap.docs.map((d) => d.id));
        };
        
        const fetchUserData = async () => {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) setUserData(snap.data());
        };
        
        fetchAllTitles();
        fetchEarnedTitles();
        fetchUserData();
    }, [user]);
    
    // --------------------------------
    // ★ 説明文（description）でタブを作る
    //    → ただし、中に入る称号は “condition ベース”
    // --------------------------------
    const groupedByDescription = titles.reduce((acc, title) => {
        const desc = title.description || "説明なし";
        const condition = title.condition;
        
        // まだグループがなければ作成
        if (!acc[desc]) {
            acc[desc] = {
                description: desc,  // ← タブ名として使われる
                groups: {}          // ← ここに condition 別に入れる
            };
        }
        
        // 条件グループがなければ作成
        if (!acc[desc].groups[condition]) {
            acc[desc].groups[condition] = [];
        }
        
        // 同じ説明グループ内の同じ条件に追加
        acc[desc].groups[condition].push(title);
        
        return acc;
    }, {});
    
    // --------------------------------
    // フィルタ（カテゴリ）
    // --------------------------------
    const applyFilter = (groups) => {
        if (selectedFilter === "all") return groups;
        
        const filtered = {};
        
        for (const desc in groups) {
            const groupObj = groups[desc];
            const filteredGroup = {};
            
            for (const cond in groupObj.groups) {
                const list = groupObj.groups[cond].filter(
                                                          (t) => t.category === selectedFilter
                                                          );
                if (list.length > 0) filteredGroup[cond] = list;
            }
            
            if (Object.keys(filteredGroup).length > 0) {
                filtered[desc] = {
                    description: groupObj.description,
                    groups: filteredGroup
                };
            }
        }
        return filtered;
    };
    
    const filteredGroups = applyFilter(groupedByDescription);
    
    // --------------------------------
    // 進捗値の取得
    // --------------------------------
    const fieldMap = {
        homeworkCount: "homeworkCount",
        wordTestCount: "wordTestCount",
        totalWordTestScore: "totalWordTestScore",
        selfStudyCount: "selfStudyCount",
        totalStudyMinutes: "totalStudyMinutes",
        rewardsCount: "rewardsCount",
        level: "level",
    };
    
    const getCurrentValue = (title) => {
        const field = fieldMap[title.category];
        return Number(userData[field] ?? 0);
    };
    
    // --------------------------------
    // 使用称号の設定
    // --------------------------------
    const handleSelectTitle = async (title) => {
        if (!user) return alert("ログインしてください");
        
        await updateDoc(doc(db, "users", user.uid), {
            currentTitle: title.id,
            titleUpdatedAt: serverTimestamp(),
        });
        
        alert(`称号「${title.name}」を設定しました！`);
    };
    
    // --------------------------------
    // アコーディオン開閉
    // --------------------------------
    const toggleGroup = (desc) => {
        setOpenGroups((prev) => ({
            ...prev,
            [desc]: !prev[desc],
        }));
    };
    
    // --------------------------------
    // JSX — 画面全体
    // --------------------------------
    return (
      <div className="titles-page">
        <h1 className="titles-heading">称号一覧</h1>

        {/* ▼ タブ */}
        <div className="titles-tabs">
          <button
            className={`tab-btn ${activeTab === "conditions" ? "active" : ""}`}
            onClick={() => setActiveTab("conditions")}
          >
            説明別
          </button>
          <button
            className={`tab-btn ${activeTab === "earned" ? "active" : ""}`}
            onClick={() => setActiveTab("earned")}
          >
            獲得済
          </button>
        </div>

        {/* ▼ カテゴリフィルタ */}
        {activeTab === "conditions" && (
          <div className="title-filter-box">
            <select
              className="title-filter-select"
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
            >
              <option value="all">すべて</option>
              <option value="homeworkCount">宿題提出</option>
              <option value="wordTestCount">単語テスト回数</option>
              <option value="totalWordTestScore">単語テスト総得点</option>
              <option value="selfStudyCount">自習回数</option>
              <option value="totalStudyMinutes">総自習時間</option>
              <option value="level">レベル</option>
              <option value="rewardsCount">景品交換</option>
            </select>
          </div>
        )}

        {/* ▼ タブ1：説明文（desc）ごとグループ */}
        {activeTab === "conditions" && (
          <div className="title-groups-wrapper">
            {Object.keys(filteredGroups).map((desc) => {
              const descGroup = filteredGroups[desc];
              const isOpen = openGroups[desc];

              return (
                <div key={desc} className="title-group">
                  {/* ▼ タブ（＝説明文） */}
                  <div
                    className="title-group-header"
                    onClick={() => toggleGroup(desc)}
                  >
                    <h2 className="group-title">{desc}</h2>
                    <span>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* ▼ タブ内部 */}
                  {isOpen && (
                    <div className="title-group-body">

                      {/* ▼ 同じ説明の中に、条件ごとに複数称号が入る */}
                      {Object.keys(descGroup.groups).map((cond) => {
                        const titlesInCondition = descGroup.groups[cond];

                        return (
                          <div key={cond} className="condition-block">
                            {/* --- 条件名 --- */}
                            <h3 className="condition-header">{cond}</h3>

                            {/* --- 称号カードたち --- */}
                            <div className="titles-grid">
                              {titlesInCondition.map((title) => {
                                const earned = earnedTitles.includes(title.id);
                                const isCurrent =
                                  userData.currentTitle === title.id;

                                const current = getCurrentValue(title);
                                const required = title.requiredValue;
                                const percent = Math.min(
                                  100,
                                  Math.floor((current / required) * 100)
                                );

                                return (
                                  <div
                                    key={title.id}
                                    className={`title-card ${
                                      earned ? "earned" : "locked"
                                    } ${isCurrent ? "current" : ""}`}
                                    onClick={() =>
                                      earned && handleSelectTitle(title)
                                    }
                                  >
                                    <h2>
                                      {earned ? title.name : "？？？"}
                                    </h2>

                                    {/* --- 条件表示 --- */}
                                    <p className="condition-text">
                                      {title.condition}
                                    </p>

                                    {/* --- 未獲得の進捗 --- */}
                                    {!earned && (
                                      <>
                                        <p className="progress-text">
                                          {current} / {required}
                                        </p>

                                        <div className="progress-bar">
                                          <div
                                            className="progress-bar-fill"
                                            style={{ width: `${percent}%` }}
                                          ></div>
                                        </div>
                                      </>
                                    )}

                                    {/* --- 獲得済みラベル --- */}
                                    {earned && (
                                      <p className="earned-label">
                                        {isCurrent ? "使用中" : "獲得済み"}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ▼ タブ2：獲得済み一覧 */}
        {activeTab === "earned" && (
          <div className="earned-grid">
            {titles
              .filter((t) => earnedTitles.includes(t.id))
              .map((title) => {
                const isCurrent = userData.currentTitle === title.id;

                return (
                  <div
                    key={title.id}
                    className={`title-card earned ${isCurrent ? "current" : ""}`}
                    onClick={() => handleSelectTitle(title)}
                  >
                    <h2>{title.name}</h2>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    );
  }
