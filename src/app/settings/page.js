"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth, db, storage } from "@/firebaseConfig";
import { doc, getDoc, getDocFromServer, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
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
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState("");

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const handleAvatarLoaded = useCallback(() => {
    setAvatarStatus((current) =>
      current === "アバターをアップロードしています…" ? current : "アバターを表示できました。"
    );
  }, []);

  const handleAvatarError = useCallback(() => {
    setAvatarStatus("このVRMファイルを表示できません。別のファイルをお試しください。");
  }, []);

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
    try {
      await updateDoc(doc(db, "users", user.uid), {
        displayName: name.trim(),
        updatedAt: new Date(),
      });
      await updateProfile(user, { displayName: name.trim() });
      setName(name.trim());
      alert("名前を更新しました！");
    } catch (error) {
      console.error("名前の更新に失敗しました:", error);
      alert("名前を更新できませんでした。通信状態を確認してください。");
    } finally {
      setSavingName(false);
    }
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

      setSavingAvatar(true);
      setAvatarStatus("アバターをアップロードしています…");
      let uploadedAvatarRef = null;
      try {
        const extension = avatarFile.name.toLowerCase().endsWith(".vrm")
          ? "vrm"
          : "glb";
        const storageRef = ref(
          storage,
          `avatars/${user.uid}/avatar-${Date.now()}.${extension}`
        );
        uploadedAvatarRef = storageRef;

        await uploadBytes(storageRef, avatarFile, {
          contentType: avatarFile.type || "application/octet-stream",
          customMetadata: { ownerUid: user.uid },
        });

        const downloadURL = await getDownloadURL(storageRef);
        const previousAvatarUrl = avatarUrl;
        const avatarVersion = Date.now();

        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
          avatarUrl: downloadURL,
          avatarStoragePath: storageRef.fullPath,
          avatarVersion,
          avatarUpdatedAt: new Date(),
          updatedAt: new Date(),
        });

        const savedSnapshot = await getDocFromServer(userRef);
        const savedData = savedSnapshot.data();
        if (
          savedData?.avatarUrl !== downloadURL ||
          Number(savedData?.avatarVersion) !== avatarVersion
        ) {
          throw new Error("プロフィールへの保存を確認できませんでした。");
        }

        localStorage.setItem(
          `avatar:${user.uid}`,
          JSON.stringify({ avatarUrl: downloadURL, avatarVersion })
        );
        setAvatarUrl(downloadURL);
        setAvatarFile(null);
        setAvatarPreviewUrl("");
        setAvatarStatus("新しいアバターを反映しました。");

        if (previousAvatarUrl && previousAvatarUrl !== downloadURL) {
          try {
            deleteObject(ref(storage, previousAvatarUrl)).catch(() => {});
          } catch {
            // 過去URLがFirebase Storage以外でも、新しい保存結果は維持する
          }
        }

        alert("アバターを更新しました！");
      } catch (e) {
        console.error(e);
        if (uploadedAvatarRef) {
          deleteObject(uploadedAvatarRef).catch(() => {});
        }
        setAvatarStatus(`更新に失敗しました：${e.message || "原因不明のエラー"}`);
        alert(`${e.code || "avatar/update-failed"}\n${e.message}`);
      } finally {
        setSavingAvatar(false);
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
          VRMファイルを選ぶと、保存前にプレビューできます。
          </p>

          <input
            type="file"
            accept=".vrm,model/gltf-binary,application/octet-stream"
            className="settings-input"
            onChange={(e)=>{
              const file = e.target.files?.[0];
              if (!file) return;
              if (!file.name.toLowerCase().endsWith(".vrm")) {
                alert("VRM形式のファイルを選択してください。");
                e.target.value = "";
                return;
              }
              if (file.size > 50 * 1024 * 1024) {
                alert("ファイルサイズは50MB以下にしてください。");
                e.target.value = "";
                return;
              }
              setAvatarFile(file);
              setAvatarPreviewUrl(URL.createObjectURL(file));
              setAvatarStatus("保存前のプレビューを表示しています。");
            }}
          />

          <button
            className="settings-save-btn"
            onClick={saveAvatar}
            disabled={!avatarFile || savingAvatar}
          >
            {savingAvatar ? "アップロード中…" : "このアバターを保存"}
          </button>
          {avatarStatus && (
            <p className="settings-avatar-status" role="status">{avatarStatus}</p>
          )}
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

            {(avatarPreviewUrl || avatarUrl) && (
              <Avatar3DWrapper
                key={avatarPreviewUrl || avatarUrl}
                url={avatarPreviewUrl || avatarUrl}
                onLoad={handleAvatarLoaded}
                onError={handleAvatarError}
              />
            )}
            {!avatarPreviewUrl && !avatarUrl && (
              <p className="settings-empty">アバターはまだ設定されていません</p>
            )}

          </div>
          </section>
          </div>
          </main>

          );

          }
