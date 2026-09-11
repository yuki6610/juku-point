"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import "./elementary-manager.css";

export default function ElementaryStudentManager({ onNotice }) {
  const [students, setStudents] = useState([]);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(1);
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");

  const notify = (message) => onNotice?.(message);
  const loadStudents = async () => {
    const snapshot = await getDocs(collection(db, "adminStudents"));
    setStudents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => Number(a.grade || 0) - Number(b.grade || 0) || String(a.name || "").localeCompare(String(b.name || ""), "ja")));
  };

  useEffect(() => { loadStudents().catch(() => notify("小学生の一覧を読み込めませんでした。")); }, []);

  const registerStudent = async (event) => {
    event.preventDefault();
    if (!name.trim()) return notify("名前を入力してください。");
    setBusy(true);
    try {
      await addDoc(collection(db, "adminStudents"), { name: name.trim(), grade: Number(grade), weekdays: [], active: true, createdBy: auth.currentUser?.uid || null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setName(""); setGrade(1); await loadStudents(); notify("小学生を登録しました。");
    } catch (error) { console.error(error); notify("小学生を登録できませんでした。"); }
    finally { setBusy(false); }
  };

  const saveStudent = async (student) => {
    const values = editing[student.id] || {};
    const nextName = String(values.name ?? student.name ?? "").trim();
    const nextGrade = Number(values.grade ?? student.grade);
    if (!nextName) return notify("名前を入力してください。");
    setBusy(true);
    try {
      await updateDoc(doc(db, "adminStudents", student.id), { name: nextName, grade: nextGrade, updatedAt: serverTimestamp() });
      setEditing((current) => { const next = { ...current }; delete next[student.id]; return next; });
      await loadStudents(); notify("小学生の情報を更新しました。");
    } catch (error) { console.error(error); notify("小学生の情報を更新できませんでした。"); }
    finally { setBusy(false); }
  };

  const setEnrollmentStatus = async (student, withdrawn) => {
    if (withdrawn && !window.confirm(`${student.name}さんを退塾扱いにしますか？\n過去の出欠記録は残ります。`)) return;
    setBusy(true);
    try { await updateDoc(doc(db, "adminStudents", student.id), { active: !withdrawn, enrollmentStatus: withdrawn ? "withdrawn" : "active", withdrawnAt: withdrawn ? serverTimestamp() : null, updatedAt: serverTimestamp() }); await loadStudents(); notify(withdrawn ? "退塾者へ移動しました。" : "在籍中へ戻しました。"); }
    catch (error) { console.error(error); notify("在籍状態を更新できませんでした。"); }
    finally { setBusy(false); }
  };

  return <section className="elementary-manager">
    <div className="elementary-manager-heading"><div><span>ELEMENTARY</span><h2>小学生の登録・編集</h2><p>ログインアカウントを持たない小学生を、名前と学年だけで管理します。</p></div><strong>{students.length}人</strong></div>
    <form className="elementary-add-form" onSubmit={registerStudent}>
      <label>名前<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例：山田 太郎" /></label>
      <label>学年<select value={grade} onChange={(event) => setGrade(Number(event.target.value))}>{[1,2,3,4,5,6].map((value) => <option key={value} value={value}>小学{value}年</option>)}</select></label>
      <button disabled={busy}>{busy ? "登録中…" : "小学生を登録"}</button>
    </form>
    <div className="elementary-status-filter"><button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>在籍中</button><button className={statusFilter === "withdrawn" ? "active" : ""} onClick={() => setStatusFilter("withdrawn")}>退塾者</button></div>
    <div className="elementary-manager-list">
      {students.filter((student) => statusFilter === "withdrawn" ? student.active === false || student.enrollmentStatus === "withdrawn" : student.active !== false && student.enrollmentStatus !== "withdrawn").map((student) => { const values = editing[student.id] || {}; return <article key={student.id}>
        <input value={values.name ?? student.name ?? ""} onChange={(event) => setEditing((current) => ({ ...current, [student.id]: { ...current[student.id], name: event.target.value } }))} aria-label={`${student.name}の名前`} />
        <select value={values.grade ?? student.grade ?? 1} onChange={(event) => setEditing((current) => ({ ...current, [student.id]: { ...current[student.id], grade: Number(event.target.value) } }))}>{[1,2,3,4,5,6].map((value) => <option key={value} value={value}>小学{value}年</option>)}</select>
        <span>{(student.weekdays || []).length ? "通塾曜日設定済み" : "通塾曜日未設定"}</span>
        <button disabled={busy} onClick={() => saveStudent(student)}>保存</button>
        <button disabled={busy} className={student.active === false || student.enrollmentStatus === "withdrawn" ? "restore" : "delete"} onClick={() => setEnrollmentStatus(student, !(student.active === false || student.enrollmentStatus === "withdrawn"))}>{student.active === false || student.enrollmentStatus === "withdrawn" ? "復帰" : "退塾"}</button>
      </article>; })}
      {!students.length && <p className="elementary-manager-empty">登録された小学生はいません。</p>}
    </div>
  </section>;
}
