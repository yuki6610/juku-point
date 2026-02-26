"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth, updateProfile } from "firebase/auth";
import { db } from "@/firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import Avatar3DWrapper from "@/components/RpmAvatarCanvas";
import "./settings.css";

export default function SettingsPage() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [avatarUrl, setAvatarUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);

  // -----------------------------
  // ユーザーデータ読み込み
  // -----------------------------
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();

        setAvatarUrl(data.avatarUrl || "");
        setName(data.displayName || data.realName || "");
      }

      setLoading(false);
    };

    load();
  }, [user]);

  // -----------------------------
  // 名前変更
  // -----------------------------
  const saveName = async () => {
    if (!name.trim()) return alert("名前を入力してください");

    setSavingName(true);

    // Firestore の更新
    await updateDoc(doc(db, "users", user.uid), {
      displayName: name,
      updatedAt: new Date(),
    });

    // Firebase Auth の名前も更新
    await updateProfile(user, { displayName: name });

    setSavingName(false);
    alert("名前を更新しました！");
  };

  // -----------------------------
  // アバター保存
  // -----------------------------
  const saveAvatar = async () => {
    if (!user) return;

    await updateDoc(doc(db, "users", user.uid), {
      avatarUrl,
    });

    alert("アバターを更新しました！");
    router.push("/mypage");
  };

  if (loading) return <p>読み込み中...</p>;

  return (
    <div className="settings-container">
      <h2 className="settings-title">⚙️ 設定</h2>

      {/* -----------------------------
          名前変更セクション
      ----------------------------- */}
      <h3 className="settings-section-title">📝 表示名の変更</h3>

      <p className="settings-desc">
        アプリ内で表示される名前を変更できます。
      </p>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="settings-input"
        placeholder="新しい名前を入力"
      />

      <button
        onClick={saveName}
        className="settings-save-btn"
        disabled={savingName}
      >
        {savingName ? "保存中..." : "名前を保存"}
      </button>

      {/* -----------------------------
          アバター設定セクション
      ----------------------------- */}
      <h3 className="settings-section-title">🎨 アバター設定</h3>

      <p className="settings-desc">
        Ready Player Me のアバターURL（GLB）を入力してください。
      </p>

      <input
        type="text"
        value={avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
        placeholder="https://models.readyplayer.me/xxxx.glb"
        className="settings-input"
      />

      <button onClick={saveAvatar} className="settings-save-btn">
        アバターを保存
      </button>
          
          <a
            href="https://readyplayer.me/avatar"
            target="_blank"
            className="settings-link"
          >
            🎭 アバターを作成する（Ready Player Me）
          </a>

      <h3 className="settings-preview-title">プレビュー</h3>

      <div className="settings-preview-box">
        <Avatar3DWrapper url={avatarUrl} />
      </div>

    </div>
  );
}
