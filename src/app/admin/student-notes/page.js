"use client";
import { useEffect, useMemo, useState } from "react";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { auth } from "@/firebaseConfig";
import "./student-notes.css";
import { availableStudentGrades } from "@/lib/studentFilterOptions.mjs";

const gradeLabel = (value) =>
  value <= 6 ? `小${value}` : value <= 9 ? `中${value - 6}` : `高${value - 9}`;
const fields = [
  ["targetSchool", "志望校"],
  ["memo", "生徒メモ"],
  ["materials", "教材"],
  ["courseMaterials", "講習教材"],
  ["sharedInfo", "講師への共有事項"],
];

export default function StudentNotesPage() {
  const edits = useUnsavedChanges(".student-sheet");
  const [rows, setRows] = useState([]),
    [grade, setGrade] = useState("all"),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState("");
  const token = async () => auth.currentUser?.getIdToken();
  const load = async () => {
    if (!edits.confirmDiscard()) return;
    edits.markSaved();
    setNotice("");
    try {
      const response = await fetch("/api/admin/student-notes", {
          headers: { Authorization: `Bearer ${await token()}` },
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.rows || []);
    } catch (error) {
      setNotice(error.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const shown = useMemo(
    () =>
      rows
        .filter((row) => grade === "all" || String(row.grade) === grade)
        .sort(
          (a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "ja"),
        ),
    [rows, grade],
  );
  const availableGrades = useMemo(() => availableStudentGrades(rows), [rows]);
  const update = (key, field, value) =>
    setRows((old) =>
      old.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  const save = async (row) => {
    setSaving(row.key);
    setNotice("");
    try {
      const response = await fetch("/api/admin/student-notes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await token()}`,
          },
          body: JSON.stringify(row),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows((old) =>
        old.map((item) =>
          item.key === row.key ? { ...item, version: data.version } : item,
        ),
      );
      setNotice(`${row.name}さんのメモを保存しました。`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving("");
    }
  };
  return (
    <main className="notes-page">
      <header className="notes-head">
        <div>
          <span>STUDENT SHEET</span>
          <h1>生徒メモ</h1>
          <p>
            一覧を見ながら直接編集できます。講師が学習記録へ入力した教室内メモも右端に反映されます。
          </p>
        </div>
        <button onClick={load}>最新に更新</button>
      </header>
      <section className="notes-tools">
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="all">全学年</option>
          {availableGrades.map((value) => (
            <option key={value} value={value}>
              {gradeLabel(value)}
            </option>
          ))}
        </select>
        <strong>{shown.length}人</strong>
      </section>
      {notice && (
        <p className="notes-notice" role="status">
          {notice}
        </p>
      )}
      <div className="sheet-wrap">
        <table className="student-sheet">
          <thead>
            <tr>
              <th>No.</th>
              <th>氏名</th>
              <th>学年</th>
              {fields.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              <th>講師の教室内メモ</th>
              <th>保存</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={row.key}>
                <td>{index + 1}</td>
                <th>
                  <strong>{row.name}</strong>
                  <span className="student-school-tags">
                    {(row.schoolTags || []).map((tag) => (
                      <small key={tag}>{tag}</small>
                    ))}
                  </span>
                </th>
                <td>{gradeLabel(row.grade)}</td>
                {fields.map(([field]) => (
                  <td key={field}>
                    <textarea
                      disabled={saving === row.key}
                      aria-label={`${row.name} ${field}`}
                      rows={field === "memo" ? 3 : 2}
                      value={row[field] || ""}
                      onChange={(e) => update(row.key, field, e.target.value)}
                    />
                  </td>
                ))}
                <td className="teacher-note">
                  <p>{row.teacherMemo || "記録なし"}</p>
                  {row.teacherMemoDate && <small>{row.teacherMemoDate}</small>}
                </td>
                <td>
                  <button
                    disabled={saving === row.key}
                    onClick={() => save(row)}
                  >
                    {saving === row.key ? "保存中" : "保存"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
