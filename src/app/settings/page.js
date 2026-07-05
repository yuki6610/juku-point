"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth, db, storage } from "@/firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "./settings.css";

const Avatar3DWrapper = dynamic(
  () => import("@/components/VRMAvatarCanvas"),
  {
    ssr: false,
    loading: () => <p>プレビューを読み込み中…</p>,
  }
);

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);

  // -----------------------------
  // ユーザーデータ読み込み
  // -----------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();
          setAvatarUrl(data.avatarUrl || "");
          setName(data.displayName || data.realName || "");
        }
      } catch (error) {
        console.error("設定の読み込みに失敗しました:", error);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

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
      if (!user) {
        alert("ログイン状態を確認できません。");
        return;
      }

      if (!avatarFile) {
        alert("VRMファイルを選択してください。");
        return;
      }

      try {
        const storageRef = ref(storage, `avatars/${user.uid}/avatar.vrm`);

        await uploadBytes(storageRef, avatarFile);

        const downloadURL = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "users", user.uid), {
          avatarUrl: downloadURL,
          updatedAt: new Date(),
        });

        setAvatarUrl(downloadURL);
        alert("アバターを更新しました！");
      } catch (e) {
        console.error(e);
        alert(`${e.code}\n${e.message}`);
      }
    };
  if (loading) return <p>読み込み中...</p>;

  return (
    <main className="settings-shell">
    <div className="settings-container">
      <header className="settings-heading">
        <span>PROFILE SETTINGS</span>
        <h1 className="settings-title">プロフィール設定</h1>
        <p>表示名とアバターを自分らしく整えましょう。</p>
      </header>

      <section className="settings-card">
      <h2 className="settings-section-title">表示名</h2>

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
      </section>

          <section className="settings-card">
          <h2 className="settings-section-title">3Dアバター</h2>

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
            {!avatarUrl && <p className="settings-empty">アバターはまだ設定されていません</p>}

          </div>
          </section>
          </div>
          </main>

          );

          }
