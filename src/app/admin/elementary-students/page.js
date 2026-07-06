"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import "./elementary-students.css";

export default function ElementaryStudentsPage() {
  const [students, setStudents] = useState([]);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(1);
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadStudents = async () => {
    const snapshot = await getDocs(collection(db, "adminStudents"));
    setStudents(
      snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja")),
    );
  };

  useEffect(() => {
    loadStudents().catch(() => setNotice("小学生の一覧を読み込めませんでした。"));
  }, []);

  const registerStudent = async (event) => {
    event.preventDefault();
    if (!name.trim()) return setNotice("名前を入力してください。");
    setBusy(true);
    try {
      await addDoc(collection(db, "adminStudents"), {
        name: name.trim(),
        grade: Number(grade),
        weekdays: [],
        active: true,
        createdBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setName("");
      setGrade(1);
      await loadStudents();
      setNotice("登録しました。通塾曜日は授業・振替管理で設定できます。");
    } catch (error) {
      console.error(error);
      setNotice("登録できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const saveStudent = async (student) => {
    const values = editing[student.id] || {};
    const nextName = String(values.name ?? student.name ?? "").trim();
    const nextGrade = Number(values.grade ?? student.grade);
    if (!nextName) return setNotice("名前を入力してください。");
    await updateDoc(doc(db, "adminStudents", student.id), {
      name: nextName,
      grade: nextGrade,
      updatedAt: serverTimestamp(),
    });
    setEditing((current) => {
      const next = { ...current };
      delete next[student.id];
      return next;
    });
    await loadStudents();
    setNotice("生徒情報を更新しました。");
  };

  const removeStudent = async (student) => {
    if (!window.confirm(`${student.name}さんを削除しますか？`)) return;
    await deleteDoc(doc(db, "adminStudents", student.id));
    await loadStudents();
    setNotice("削除しました。");
  };

  return (
    <main className="elementary-page">
      <header>
        <span>ELEMENTARY STUDENTS</span>
        <h1>小学生登録</h1>
        <p>スマートフォンやログインアカウントを持たない小学生だけを登録します。</p>
      </header>

      {notice && <p className="elementary-notice">{notice}</p>}

      <section className="elementary-register">
        <div>
          <h2>新しい生徒を登録</h2>
          <p>必要なのは名前と学年だけです。</p>
        </div>
        <form onSubmit={registerStudent}>
          <label>
            名前
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例：山田 太郎" />
          </label>
          <label>
            学年
            <select value={grade} onChange={(event) => setGrade(Number(event.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>小学{value}年</option>
              ))}
            </select>
          </label>
          <button disabled={busy}>{busy ? "登録中…" : "登録する"}</button>
        </form>
      </section>

      <section className="elementary-list">
        <div className="elementary-list-heading">
          <div><h2>登録済みの小学生</h2><p>{students.length}人</p></div>
          <a href="/admin/lesson-attendance">授業・振替管理を開く →</a>
        </div>
        {students.length === 0 ? (
          <p className="elementary-empty">登録された小学生はいません。</p>
        ) : students.map((student) => {
          const values = editing[student.id] || {};
          return (
            <article key={student.id}>
              <input
                value={values.name ?? student.name ?? ""}
                onChange={(event) => setEditing((current) => ({
                  ...current,
                  [student.id]: { ...current[student.id], name: event.target.value },
                }))}
                aria-label={`${student.name}の名前`}
              />
              <select
                value={values.grade ?? student.grade ?? 1}
                onChange={(event) => setEditing((current) => ({
                  ...current,
                  [student.id]: { ...current[student.id], grade: Number(event.target.value) },
                }))}
                aria-label={`${student.name}の学年`}
              >
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <option key={value} value={value}>小学{value}年</option>
                ))}
              </select>
              <span>{(student.weekdays || []).length ? "通塾曜日設定済み" : "通塾曜日未設定"}</span>
              <button onClick={() => saveStudent(student)}>保存</button>
              <button className="delete" onClick={() => removeStudent(student)}>削除</button>
            </article>
          );
        })}
      </section>
    </main>
  );
}
