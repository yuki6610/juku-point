"use client";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { useEffect, useState } from "react";
import { homeworkApi } from "@/lib/homeworkClient";
import {
  DIFFICULTY_LABELS,
  RESULT_LABELS,
  materialSubjects,
} from "@/lib/homeworkModel.mjs";
import "../lesson-records/homework.css";
const SUBJECT_PRESETS = {
  all: ["all"], japanese:["japanese"], arithmetic:["arithmetic"], math:["math"],
  english:["english"], science:["science"], social:["social"],
  middleFive:["japanese","math","english","science","social"],
  elementaryFour:["japanese","arithmetic","science","social"],
};
const subjectPreset = item => {
  const current=[...materialSubjects(item)].sort().join(',');
  return Object.entries(SUBJECT_PRESETS).find(([,subjects])=>[...subjects].sort().join(',')===current)?.[0] || 'custom';
};
export default function HomeworkTemplates() {
  const edits = useUnsavedChanges(".homework-panel");
  const [templates, setTemplates] = useState(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    homeworkApi("/api/admin/homework")
      .then((data) => setTemplates(data.templates))
      .catch((error) => setNotice(error.message));
  }, []);
  const patch = (key, index, value) =>
    setTemplates((old) => ({
      ...old,
      [key]: old[key].map((row, n) =>
        n === index ? { ...row, ...value } : row,
      ),
    }));
  const move = (key, index, step) =>
    setTemplates((old) => {
      const rows = [...old[key]],
        next = index + step;
      if (next < 0 || next >= rows.length) return old;
      [rows[index], rows[next]] = [rows[next], rows[index]];
      return { ...old, [key]: rows };
    });
  const save = async (action) => {
    setBusy(action);
    try {
      const data = await homeworkApi(
        "/api/admin/homework",
        action === "materials"
          ? { action, materials: templates.materials }
          : {
              action: "texts",
              comments: templates.comments,
              results: templates.results,
            },
      );
      setTemplates(data.templates);
      edits.markSaved();
      setNotice(
        action === "materials"
          ? "教材だけを保存しました。"
          : "宿題の提出結果表示を保存しました。",
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy("");
    }
  };
  if (!templates)
    return (
      <section className="homework-panel">
        <p>{notice || "設定を読み込み中…"}</p>
      </section>
    );
  return (
    <section className="homework-panel">
      <h2>教材・宿題表示の設定</h2>
      <p>授業報告はこの設定を使わず、講師が選択した評価情報からAPIで生成します。</p>
      {notice && <p role="status">{notice}</p>}
      <fieldset disabled={Boolean(busy)}>
        <legend>教材</legend>
        {templates.materials.map((item, index) => (
          <div
            className="homework-row template-row material-template-row"
            key={item.id}
          >
            <input
              aria-label="教材名"
              value={item.label}
              maxLength={200}
              onChange={(e) =>
                patch("materials", index, { label: e.target.value })
              }
            />
            <select
              aria-label="対象校種"
              value={item.audience || "all"}
              onChange={(e) =>
                patch("materials", index, { audience: e.target.value })
              }
            >
              <option value="elementary">小学生</option>
              <option value="middle">中学生</option>
              <option value="all">共通</option>
            </select>
            <select aria-label="教科" value={subjectPreset(item)} onChange={event=>{if(event.target.value!=='custom')patch("materials",index,{subjects:SUBJECT_PRESETS[event.target.value]})}}>
              {subjectPreset(item)==='custom'&&<option value="custom">複数教科（現在設定）</option>}
              <option value="all">全教科</option>
              <option value="japanese">国語</option>
              <option value="arithmetic">算数</option>
              <option value="math">数学</option>
              <option value="english">英語</option>
              <option value="science">理科</option>
              <option value="social">社会</option>
              <option value="middleFive">中学生5教科</option>
              <option value="elementaryFour">小学生4教科</option>
            </select>
            <select
              aria-label="初期難易度"
              value={item.difficulty || 3}
              onChange={(e) =>
                patch("materials", index, {
                  difficulty: Number(e.target.value),
                })
              }
            >
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  ★{value} {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => move("materials", index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={index === templates.materials.length - 1}
              onClick={() => move("materials", index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() =>
                setTemplates((old) => ({
                  ...old,
                  materials: old.materials.filter((row) => row.id !== item.id),
                }))
              }
            >
              削除
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setTemplates((old) => ({
              ...old,
              materials: [
                ...old.materials,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  audience: "middle",
                  subjects: ["all"],
                  difficulty: 3,
                },
              ],
            }))
          }
        >
          ＋教材を追加
        </button>
        <button
          type="button"
          className="template-save-primary"
          disabled={Boolean(busy)}
          onClick={() => save("materials")}
        >
          {busy === "materials" ? "保存中…" : "教材を保存"}
        </button>
      </fieldset>
      <fieldset disabled={Boolean(busy)}>
        <legend>宿題の提出結果表示</legend>
        {Object.entries(RESULT_LABELS).map(([id, label]) => (
          <label key={id}>
            {label}
            <input
              style={{ width: "100%" }}
              value={templates.results[id]}
              maxLength={300}
              onChange={(e) =>
                setTemplates((old) => ({
                  ...old,
                  results: { ...old.results, [id]: e.target.value },
                }))
              }
            />
          </label>
        ))}
        <button
          type="button"
          className="template-save-primary"
          disabled={Boolean(busy)}
          onClick={() => save("texts")}
        >
          {busy === "texts" ? "保存中…" : "提出結果表示を保存"}
        </button>
      </fieldset>
    </section>
  );
}
