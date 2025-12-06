"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import Link from "next/link";
import './titles.css'

// ----------------------------------------
// ⭐ 称号カテゴリ一覧（単語テスト総得点を追加済み）
// ----------------------------------------
const CATEGORY_OPTIONS = [
  { value: "wordTestCount", label: "単語テスト回数" },
  { value: "totalWordTestScore", label: "単語テスト総得点" }, // ★追加
  { value: "homeworkCount", label: "宿題提出回数" },
  { value: "selfStudyCount", label: "自習回数" },
  { value: "totalStudyMinutes", label: "総自習時間（分）" },
  { value: "level", label: "レベル" },
  { value: "rewardsCount", label: "景品交換回数" },
];

export default function AdminTitles() {
  const [titles, setTitles] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("homeworkCount");
  const [requiredValue, setRequiredValue] = useState("");

  useEffect(() => {
    fetchTitles();
  }, []);

  const fetchTitles = async () => {
    const snap = await getDocs(collection(db, "titles"));
    setTitles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

    const addTitle = async () => {
      if (!name) return alert("称号名を入力してください");
      if (!requiredValue) return alert("しきい値を入力してください");

      const th = Number(requiredValue);
      if (Number.isNaN(th) || th <= 0) {
        return alert("しきい値は正の数で入力してください");
      }

      // カテゴリに応じて条件文を作る
      let conditionText = "";

      switch (category) {
        case "level":
          conditionText = `Lv${th}到達`;
          break;
        case "homeworkCount":
          conditionText = `宿題${th}回`;
          break;
        case "selfStudyCount":
          conditionText = `自習${th}回`;
          break;
        case "totalStudyMinutes":
          conditionText = `自習${th}分`;
          break;
        case "wordTestCount":
          conditionText = `単語テスト${th}回`;
          break;
        case "totalWordTestScore":
          conditionText = `単語テスト総得点${th}点`;
          break;
        case "rewardsCount":
          conditionText = `景品交換${th}回`;
          break;
        default:
          conditionText = `${th}達成`;
      }

      await addDoc(collection(db, "titles"), {
        name,
        description,
        category,
        requiredValue: th,
        condition: conditionText,
        createdAt: serverTimestamp(),
      });

      setName("");
      setDescription("");
      setRequiredValue("");

      fetchTitles();
    };
  const removeTitle = async (id) => {
    if (!confirm("削除してもよろしいですか？")) return;
    await deleteDoc(doc(db, "titles", id));
    fetchTitles();
  };

  const renderCategoryLabel = (value) => {
    const hit = CATEGORY_OPTIONS.find((c) => c.value === value);
    return hit ? hit.label : value || "-";
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>🏆 称号管理（追加／一覧）</h1>

      {/* 追加フォーム */}
      <div
        style={{
          marginBottom: "20px",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <input
          placeholder="称号名（例：コツコツ王）"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "4px 8px" }}
        />

        <input
          placeholder="説明（任意）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ padding: "4px 8px", minWidth: "220px" }}
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ padding: "4px 8px" }}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="しきい値（例：10）"
          value={requiredValue}
          onChange={(e) => setRequiredValue(e.target.value)}
          style={{ padding: "4px 8px", width: "140px" }}
        />

        <button onClick={addTitle} style={{ padding: "6px 12px" }}>
          ＋ 追加
        </button>
      </div>

      {/* 一覧テーブル */}
      <table border="1" cellPadding="8">
        <thead>
          <tr>
            <th>称号名</th>
            <th>説明</th>
            <th>カテゴリ</th>
            <th>しきい値</th>
            <th>条件文</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {titles.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.description}</td>
              <td>{renderCategoryLabel(t.category)}</td>
              <td>{t.requiredValue ?? "-"}</td>
              <td>{t.condition ?? "-"}</td>
              <td>
                <button onClick={() => removeTitle(t.id)}>削除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <br />
      <Link href="/admin/titles/assign">
        <button>🎁 生徒へ称号付与</button>
      </Link>
    </div>
  );
}
