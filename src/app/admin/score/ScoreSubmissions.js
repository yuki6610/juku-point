"use client";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/firebaseConfig";
import { useAcademicContext } from "@/lib/useAcademicContext";
import ScoreSubmissionCalendar from "./ScoreSubmissionCalendar";
import { availableStudentGrades } from "@/lib/studentFilterOptions.mjs";

const gradeLabel = (value) => `中${Number(value) - 6}`;
const itemLabel = (item) => (item.kind === "exam" ? item.testType : "通知表");
export default function ScoreSubmissions() {
  const academic = useAcademicContext(),
    [view, setView] = useState("check"),
    [termId, setTermId] = useState(""),
    [rows, setRows] = useState([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("missing"),
    [grade, setGrade] = useState("all"),
    [school, setSchool] = useState("all");
  const terms = academic.settings
    .flatMap((item) =>
      [1, 2, 3].map((term) => ({
        id: `${item.year}_${term}`,
        label: `${item.year}年度 ${term}学期`,
      })),
    )
    .sort((a, b) => b.id.localeCompare(a.id));
  const schools = [
    ...new Set(rows.map((row) => row.schoolName).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "ja"));
  const availableGrades = useMemo(() => availableStudentGrades(rows), [rows]);
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (grade === "all" || String(row.grade) === grade) &&
          (school === "all" || row.schoolName === school) &&
          (filter === "all" ||
            (filter === "missing" && row.missingCount > 0) ||
            (filter === "exam" &&
              row.submissionItems.some(
                (item) => item.kind === "exam" && item.status === "missing",
              )) ||
            (filter === "internal" &&
              row.submissionItems.some(
                (item) => item.kind === "internal" && item.status === "missing",
              )) ||
            (filter === "unscheduled" && !row.hasSchedule)),
      ),
    [rows, grade, school, filter],
  );
  const missing = rows.filter((row) => row.missingCount > 0).length;
  useEffect(() => {
    if (!termId && academic.current) setTermId(academic.current.id);
  }, [academic.current, termId]);
  const api = async (path, options = {}) => {
    const token = await auth.currentUser?.getIdToken(),
      response = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
      result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  };
  const load = () => {
    if (!termId) return;
    setBusy(true);
    api(`/api/admin/score-submissions?term=${termId}`)
      .then((result) => setRows(result.students))
      .catch((error) => setNotice(error.message))
      .finally(() => setBusy(false));
  };
  useEffect(load, [termId]);
  const change = async (row, item, received) => {
    const before = rows;
    setRows((old) =>
      old.map((value) =>
        value.uid === row.uid
          ? {
              ...value,
              submissionItems: value.submissionItems.map((entry) =>
                entry.id === item.id
                  ? { ...entry, status: received ? "received" : "missing" }
                  : entry,
              ),
              missingCount: Math.max(
                0,
                value.missingCount + (received ? -1 : 1),
              ),
            }
          : value,
      ),
    );
    try {
      await api("/api/admin/score-submissions", {
        method: "POST",
        body: JSON.stringify({
          uid: row.uid,
          termId,
          itemId: item.id,
          received,
          examReceived: row.examReceived,
          internalReceived: row.internalReceived,
        }),
      });
      setNotice(
        `${row.name}さんの${itemLabel(item)}を${received ? "提出済み" : "未提出"}に変更しました。`,
      );
      load();
    } catch (error) {
      setRows(before);
      setNotice(error.message);
    }
  };
  return (
    <section className="score-submissions-shell">
      <nav className="submission-view-tabs">
        <button
          className={view === "check" ? "active" : ""}
          onClick={() => setView("check")}
        >
          提出状況を確認
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => setView("calendar")}
        >
          提出カレンダーを設定
        </button>
      </nav>
      {view === "calendar" ? (
        <ScoreSubmissionCalendar academic={academic} onChanged={load} />
      ) : (
        <section className="score-submissions">
          <div className="submission-heading">
            <div>
              <h2>テスト・通知表の提出状況</h2>
              <p>
                保存済みの該当テスト・通知表データがある場合は、自動的に提出済みとして扱います。
              </p>
            </div>
            <select value={termId} onChange={(e) => setTermId(e.target.value)}>
              {terms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="submission-summary-bar">
            <strong>
              {missing}
              <small>人</small>
            </strong>
            <span>未提出あり</span>
            <div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="missing">未提出あり</option>
                <option value="exam">テスト未提出</option>
                <option value="internal">通知表未提出</option>
                <option value="unscheduled">予定未設定</option>
                <option value="all">全員</option>
              </select>
              <select
                value={school}
                onChange={(e) => setSchool(e.target.value)}
              >
                <option value="all">全学校</option>
                {schools.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="all">全学年</option>
                {availableGrades.map((value) => <option key={value} value={value}>{gradeLabel(value)}</option>)}
              </select>
            </div>
          </div>
          {notice && <p role="status">{notice}</p>}
          {busy ? (
            <p>読み込み中…</p>
          ) : visible.length ? (
            <div className="submission-student-list">
              {visible.map((row) => (
                <article key={row.uid}>
                  <header>
                    <div>
                      <strong>{row.name}</strong>
                      <span>
                        {gradeLabel(row.grade)}・
                        {row.schoolName || "学校未登録"}
                      </span>
                    </div>
                    <b className={!row.hasSchedule || row.missingCount || row.submissionItems.some(item => item.status === "upcoming") ? "pending" : "complete"}>
                      {row.hasSchedule
                        ? row.missingCount
                          ? `未提出 ${row.missingCount}件`
                          : row.submissionItems.some(item => item.status === "upcoming")
                            ? "提出予定"
                            : "提出確認済み"
                        : "予定未設定"}
                    </b>
                  </header>
                  {row.hasSchedule ? (
                    <div className="submission-item-grid">
                      {row.submissionItems.map((item) => {
                        const received = [
                          "received",
                          "legacy",
                          "score",
                        ].includes(item.status);
                        return (
                          <label
                            key={item.id}
                            className={
                              received
                                ? "received"
                                : item.status === "upcoming"
                                  ? "upcoming"
                                  : "missing"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={received}
                              disabled={item.status === "score"}
                              onChange={(e) =>
                                change(row, item, e.target.checked)
                              }
                            />
                            <span>
                              <strong>{itemLabel(item)}</strong>
                              <small>
                                {item.date.replaceAll("-", " / ")}
                                {item.status === "score"
                                  ? "・成績データから自動判定"
                                  : item.status === "legacy"
                                    ? "・旧データから引継ぎ"
                                    : item.status === "upcoming"
                                      ? "・予定"
                                      : ""}
                              </small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="submission-unscheduled">
                      提出カレンダーに、この学校・学年・学期の予定を登録してください。
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="submission-empty">条件に該当する生徒はいません。</p>
          )}
        </section>
      )}
    </section>
  );
}
