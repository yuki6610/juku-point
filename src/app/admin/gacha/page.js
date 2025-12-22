"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import "./gacha-admin.css";

export default function GachaAdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [items, setItems] = useState([]);

  // 新規登録用フォーム
  const [newName, setNewName] = useState("");
  const [newRarity, setNewRarity] = useState("normal");
  const [newWeight, setNewWeight] = useState("10");
  const [newStock, setNewStock] = useState("-1"); // -1 なら無限扱い

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
      await loadItems();
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  // 🎁 gachaItems の読み込み
  const loadItems = async () => {
    const q = query(collection(db, "gachaItems"), orderBy("name"));
    const snap = await getDocs(q);

    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setItems(list);
  };

  // ➕ 新規景品追加
  const handleAddItem = async (e) => {
    e.preventDefault();

    if (!newName.trim()) {
      alert("景品名を入力してください。");
      return;
    }

    const weightNum = Number(newWeight);
    const stockNum = Number(newStock);

    if (isNaN(weightNum) || weightNum <= 0) {
      alert("重み（weight）は 1 以上の数値で入力してください。");
      return;
    }

    if (isNaN(stockNum)) {
      alert("在庫は数値で入力してください。（-1 で無制限）");
      return;
    }

    const ref = await addDoc(collection(db, "gachaItems"), {
      name: newName.trim(),
      rarity: newRarity,
      weight: weightNum,
      stock: stockNum,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // state 更新
    setItems((prev) => [
      ...prev,
      {
        id: ref.id,
        name: newName.trim(),
        rarity: newRarity,
        weight: weightNum,
        stock: stockNum,
      },
    ]);

    // フォームリセット
    setNewName("");
    setNewRarity("normal");
    setNewWeight("10");
    setNewStock("-1");
  };

  // 💾 既存景品の更新（1行ごと）
  const handleUpdateItem = async (id, partial) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;

    const updated = { ...target, ...partial };

    const weightNum = Number(updated.weight);
    const stockNum = Number(updated.stock);

    if (isNaN(weightNum) || weightNum <= 0) {
      alert("重み（weight）は 1 以上の数値で入力してください。");
      return;
    }
    if (isNaN(stockNum)) {
      alert("在庫は数値で入力してください。（-1 で無制限）");
      return;
    }

    const ref = doc(db, "gachaItems", id);
    await updateDoc(ref, {
      name: updated.name,
      rarity: updated.rarity,
      weight: weightNum,
      stock: stockNum,
      updatedAt: serverTimestamp(),
    });

    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...updated, weight: weightNum, stock: stockNum } : i))
    );

    alert("保存しました。");
  };

  // 🗑 景品削除
  const handleDeleteItem = async (id) => {
    const target = items.find((i) => i.id === id);
    const name = target?.name || "この景品";

    const ok = confirm(`${name} を削除しますか？\n（ポイント履歴やガチャ履歴には影響しません）`);
    if (!ok) return;

    await deleteDoc(doc(db, "gachaItems", id));

    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) {
    return <div style={{ padding: "16px" }}>読み込み中...</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: "16px" }}>
        アクセス権がありません。（管理者アカウントでログインしてください）
      </div>
    );
  }

  return (
    <div className="gadmin-container">
      <h1 className="gadmin-title">🎰 ガチャ景品管理</h1>

      <p className="gadmin-note">
        ・生徒側の <code>/gacha</code> ページで回すガチャの候補を管理します。<br />
        ・<strong>weight</strong> が大きいほど当たりやすくなります。<br />
        ・<strong>stock</strong> を -1 にすると在庫無制限になります。
      </p>

      {/* 新規追加フォーム */}
      <form className="gadmin-form" onSubmit={handleAddItem}>
        <h2 className="gadmin-subtitle">新規景品を追加</h2>

        <div className="gadmin-form-row">
          <label>景品名</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例：お菓子セット / ドリンク無料券"
          />
        </div>

        <div className="gadmin-form-row">
          <label>レアリティ</label>
          <select
            value={newRarity}
            onChange={(e) => setNewRarity(e.target.value)}
          >
            <option value="normal">normal（普通）</option>
            <option value="rare">rare（レア）</option>
            <option value="sr">SR</option>
            <option value="ur">UR</option>
          </select>
        </div>

        <div className="gadmin-form-row">
          <label>weight（出やすさ）</label>
          <input
            type="number"
            min="1"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
          />
        </div>

        <div className="gadmin-form-row">
          <label>在庫</label>
          <input
            type="number"
            value={newStock}
            onChange={(e) => setNewStock(e.target.value)}
          />
          <span className="gadmin-help">-1 で無制限</span>
        </div>

        <button type="submit" className="gadmin-add-btn">
          ＋ 追加
        </button>
      </form>

      {/* 既存リスト */}
      <h2 className="gadmin-subtitle">登録済み景品</h2>

      {items.length === 0 ? (
        <p className="gadmin-empty">まだ景品が登録されていません。</p>
      ) : (
        <div className="gadmin-table">
          <div className="gadmin-header">
            <div>景品名</div>
            <div>レアリティ</div>
            <div>weight</div>
            <div>在庫</div>
            <div>操作</div>
          </div>

          {items.map((item) => (
            <div key={item.id} className="gadmin-row">
              {/* 景品名 */}
              <div className="gadmin-cell" data-label="景品名">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((p) =>
                        p.id === item.id ? { ...p, name: e.target.value } : p
                      )
                    )
                  }
                />
              </div>

              {/* レアリティ */}
              <div className="gadmin-cell" data-label="レアリティ">
                <select
                  value={item.rarity || "normal"}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((p) =>
                        p.id === item.id ? { ...p, rarity: e.target.value } : p
                      )
                    )
                  }
                >
                  <option value="normal">normal</option>
                  <option value="rare">rare</option>
                  <option value="sr">sr</option>
                  <option value="ur">ur</option>
                </select>
              </div>

              {/* weight */}
              <div className="gadmin-cell" data-label="weight">
                <input
                  type="number"
                  min="1"
                  value={item.weight ?? 1}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((p) =>
                        p.id === item.id ? { ...p, weight: e.target.value } : p
                      )
                    )
                  }
                  className="gadmin-input-number"
                />
              </div>

              {/* stock */}
              <div className="gadmin-cell" data-label="在庫">
                <input
                  type="number"
                  value={
                    typeof item.stock === "number" ? item.stock : -1
                  }
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((p) =>
                        p.id === item.id ? { ...p, stock: e.target.value } : p
                      )
                    )
                  }
                  className="gadmin-input-number"
                />
              </div>

              {/* 操作 */}
              <div className="gadmin-cell gadmin-actions" data-label="操作">
                <button
                  type="button"
                  className="gadmin-save-btn"
                  onClick={() =>
                    handleUpdateItem(item.id, {
                      name: item.name,
                      rarity: item.rarity || "normal",
                      weight: item.weight,
                      stock: item.stock,
                    })
                  }
                >
                  保存
                </button>
                <button
                  type="button"
                  className="gadmin-delete-btn"
                  onClick={() => handleDeleteItem(item.id)}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        className="gadmin-back-btn"
        onClick={() => router.push("/admin")}
      >
        ← 管理ページへ戻る
      </button>
    </div>
  );
}
