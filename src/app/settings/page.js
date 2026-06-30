"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth, updateProfile } from "firebase/auth";
import { db, storage } from "@/firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Avatar3DWrapper from "@/components/VRMAvatarCanvas";
import "./settings.css";

export default function SettingsPage() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [avatarUrl, setAvatarUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);

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
      alert("① saveAvatar開始");

      if (!user) {
        alert("② userがありません");
        return;
      }

      if (!avatarFile) {
        alert("③ ファイルがありません");
        return;
      }

      alert("④ upload開始");

      try {
        const storageRef = ref(storage, `avatars/${user.uid}/avatar.vrm`);

        await uploadBytes(storageRef, avatarFile);

        alert("⑤ upload成功");

        const downloadURL = await getDownloadURL(storageRef);

        alert(downloadURL);

        await updateDoc(doc(db, "users", user.uid), {
          avatarUrl: downloadURL,
          updatedAt: new Date(),
        });

        alert("⑥ Firestore更新");

        setAvatarUrl(downloadURL);

        alert("完了");
      } catch (e) {
        console.error(e);
        alert(`${e.code}\n${e.message}`);
      }
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
          VRMファイルをアップロードしてください。
          </p>

          <input
            type="file"
            accept=".vrm"
            className="settings-input"
            onChange={(e)=>{
              if(e.target.files?.length){
                setAvatarFile(e.target.files[0]);
              }
            }}
          />

          <button
            className="settings-save-btn"
            onClick={saveAvatar}
          >
            アバターを保存
          </button>
          <a
            href="https://avatarmaker.vket.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="settings-link"
          >
            🎭 Vket Avatar Makerで作成
          </a>

          <h3 className="settings-preview-title">
          プレビュー
          </h3>

          <div className="settings-preview-box">

            {avatarUrl && <Avatar3DWrapper url={avatarUrl} />}

          </div>

          </div>

          );

          }
