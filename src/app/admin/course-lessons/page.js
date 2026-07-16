"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import "./course-lessons.css";

const HOMEWORK_MATERIALS = {
  "サミングアップ": ["国語", "数学", "英語", "理科", "社会"],
  "新ワーク": ["英語", "数学"],
};

const localDate = (date = new Date()) => {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
};

const addDays = (dateText, days) => {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
};

const weekRange = (dateText) => {
  const date = new Date(`${dateText}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  const monday = localDate(date);
  return { start: monday, end: addDays(monday, 6) };
};

const gradeLabel = (grade) => ({ 7: "中1", 8: "中2", 9: "中3" }[Number(grade)] || "-");
const studentName = (student) => student?.realName || student?.displayName || "名前未設定";
const formatDate = (date) => date ? date.replaceAll("-", "/") : "-";

const blankInstruction = () => ({
  studentId: "",
  type: "homework",
  assignedDate: localDate(),
  material: "サミングアップ",
  subject: "英語",
  range: "",
  wordTotal: "20",
  note: "",
});

async function adminApi(path = "", options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("管理者のログイン情報を確認できません。ページを再読み込みしてください。");
  const token = await user.getIdToken();
  const response = await fetch(`/api/admin/course-programs${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}

export default function CourseLessonsPage() {
  const currentYear = new Date().getFullYear();
  const [students, setStudents] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [tab, setTab] = useState("instruction");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participantDraft, setParticipantDraft] = useState([]);
  const [participantGrade, setParticipantGrade] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [instruction, setInstruction] = useState(blankInstruction());
  const [selectedId, setSelectedId] = useState("");
  const [result, setResult] = useState({ homeworkStatus: "submitted", wordCorrect: "", wordTotal: "20", note: "" });
  const [newProgram, setNewProgram] = useState({
    name: `${currentYear}年 夏期講習`,
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    Promise.all([getDocs(collection(db, "users")), adminApi()]).then(([snapshot, data]) => {
      setStudents(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }))
        .filter((item) => Number(item.grade) >= 7 && Number(item.grade) <= 9)
        .sort((a, b) => Number(a.grade) - Number(b.grade) || studentName(a).localeCompare(studentName(b), "ja")));
      setPrograms(data.programs || []);
      setProgramId((current) => current || data.programs?.[0]?.id || "");
    }).catch((error) => setNotice(error.message));
  }, []);

  useEffect(() => {
    if (!programId) return setAssignments([]);
    adminApi(`?programId=${encodeURIComponent(programId)}`)
      .then((data) => setAssignments(data.assignments || []))
      .catch((error) => setNotice(error.message));
  }, [programId]);

  const reloadPrograms = async (preferredId = "") => {
    const data = await adminApi();
    setPrograms(data.programs || []);
    if (preferredId) setProgramId(preferredId);
  };

  const reloadAssignments = async () => {
    if (!programId) return;
    const data = await adminApi(`?programId=${encodeURIComponent(programId)}`);
    setAssignments(data.assignments || []);
  };

  const program = programs.find((item) => item.id === programId);
  const participantIds = program?.participantIds || [];
  const participatingStudents = students.filter((item) => participantIds.includes(item.uid));
  const selected = assignments.find((item) => item.id === selectedId);
  const pending = assignments.filter((item) => item.status !== "checked");
  const history = assignments.filter((item) => item.status === "checked");
  const filtered = (items) => items.filter((item) =>
    (studentFilter === "all" || item.uid === studentFilter) &&
    (gradeFilter === "all" || Number(item.grade) === Number(gradeFilter))
  );
  const thisWeek = weekRange(localDate());
  const dueThisWeek = pending.filter((item) => item.checkWeekStart <= thisWeek.end && item.checkWeekEnd >= thisWeek.start);

  const materialSubjects = HOMEWORK_MATERIALS[instruction.material] || [];
  useEffect(() => {
    if (instruction.type === "homework" && !materialSubjects.includes(instruction.subject)) {
      setInstruction((current) => ({ ...current, subject: materialSubjects[0] || "" }));
    }
  }, [instruction.material, instruction.type]);

  useEffect(() => {
    if (!selected) return;
    setResult({
      homeworkStatus: selected.result?.homeworkStatus || "submitted",
      wordCorrect: String(selected.result?.wordCorrect ?? ""),
      wordTotal: String(selected.result?.wordTotal ?? selected.wordTotal ?? 20),
      note: selected.result?.note || "",
    });
  }, [selectedId, selected?.updatedAt]);

  const createProgram = async () => {
    if (!newProgram.name.trim() || !newProgram.startDate || !newProgram.endDate) return setNotice("講習名と期間を入力してください。");
    if (newProgram.endDate < newProgram.startDate) return setNotice("終了日は開始日以降にしてください。");
    setSaving(true);
    try {
      const data = await adminApi("", { method: "POST", body: JSON.stringify({ action: "createProgram", ...newProgram }) });
      await reloadPrograms(data.id);
      setShowProgramForm(false);
      setNotice("講習期間を作成しました。");
    } catch (error) { setNotice(error.message); } finally { setSaving(false); }
  };

  useEffect(() => {
    setParticipantDraft(program?.participantIds || []);
  }, [programId, program?.participantIds]);

  const saveParticipants = async () => {
    if (!programId) return;
    setSaving(true);
    try {
      await adminApi("", { method: "PATCH", body: JSON.stringify({
        action: "updateParticipants", programId, participantIds: participantDraft,
      }) });
      await reloadPrograms(programId);
      setShowParticipants(false);
      setNotice(`${participantDraft.length}人をこの講習の参加生徒として保存しました。`);
    } catch (error) { setNotice(error.message); } finally { setSaving(false); }
  };

  const saveInstruction = async () => {
    const student = students.find((item) => item.uid === instruction.studentId);
    if (!program || !student || !instruction.range.trim()) return setNotice("講習・生徒・範囲を入力してください。");
    if (instruction.assignedDate < program.startDate || instruction.assignedDate > program.endDate) return setNotice("指示日は講習期間内で指定してください。");
    const nextWeek = weekRange(addDays(instruction.assignedDate, 7));
    setSaving(true);
    try {
      await adminApi("", { method: "POST", body: JSON.stringify({ action: "createAssignment", programId, assignment: {
        uid: student.uid,
        studentName: studentName(student),
        grade: Number(student.grade),
        type: instruction.type,
        assignedDate: instruction.assignedDate,
        material: instruction.type === "homework" ? instruction.material : "単語テスト",
        subject: instruction.type === "homework" ? instruction.subject : "英語",
        range: instruction.range.trim(),
        wordTotal: instruction.type === "wordTest" ? Number(instruction.wordTotal || student.wordTestQuestionCount || 20) : null,
        note: instruction.note.trim(),
        checkWeekStart: nextWeek.start,
        checkWeekEnd: nextWeek.end,
      } }) });
      await reloadAssignments();
      setInstruction((current) => ({ ...blankInstruction(), studentId: current.studentId, assignedDate: current.assignedDate, type: current.type }));
      setNotice(`${studentName(student)}さんの課題を登録しました。確認予定は${formatDate(nextWeek.start)}〜${formatDate(nextWeek.end)}です。`);
    } catch (error) { setNotice(error.message); } finally {
      setSaving(false);
    }
  };

  const openResult = (item) => {
    setSelectedId(item.id);
    setTab("pending");
    setNotice("");
  };

  const saveResult = async () => {
    if (!selected) return;
    if (selected.type === "wordTest" && (Number(result.wordTotal) <= 0 || Number(result.wordCorrect) < 0 || Number(result.wordCorrect) > Number(result.wordTotal))) {
      return setNotice("単語テストの問題数と正答数を確認してください。");
    }
    setSaving(true);
    try {
      await adminApi("", { method: "PATCH", body: JSON.stringify({ programId, assignmentId: selected.id, checkedDate: localDate(), result: selected.type === "homework"
          ? { homeworkStatus: result.homeworkStatus, note: result.note.trim() }
          : { wordCorrect: Number(result.wordCorrect), wordTotal: Number(result.wordTotal), note: result.note.trim() } }) });
      await reloadAssignments();
      setNotice("確認結果を保存しました。ポイント・生活態度・出欠には反映していません。");
      setSelectedId("");
    } catch (error) { setNotice(error.message); } finally {
      setSaving(false);
    }
  };

  const AssignmentList = ({ items, historyMode = false }) => (
    <div className="assignment-list">
      {!filtered(items).length && <p className="course-empty-small">該当する課題はありません。</p>}
      {filtered(items).map((item) => (
        <article key={item.id} className={item.type === "wordTest" ? "word" : "homework"}>
          <div className="assignment-kind">{item.type === "homework" ? "宿題" : "単語"}</div>
          <div className="assignment-main">
            <div><strong>{item.studentName}</strong><span>{gradeLabel(item.grade)}</span></div>
            <h3>{item.type === "homework" ? `${item.material}・${item.subject}` : `単語テスト ${item.wordTotal}問`}</h3>
            <p>{item.range}</p>
            {item.note && <small>メモ：{item.note}</small>}
          </div>
          <div className="assignment-dates"><span>指示日</span><strong>{formatDate(item.assignedDate)}</strong><span>{historyMode ? "確認日" : "確認予定週"}</span><strong>{historyMode ? formatDate(item.checkedDate) : `${formatDate(item.checkWeekStart)}〜${formatDate(item.checkWeekEnd).slice(5)}`}</strong></div>
          {historyMode ? <div className="result-summary">{item.type === "homework" ? ({ submitted: "提出", partial: "途中", missed: "未提出" }[item.result?.homeworkStatus] || "-") : `${item.result?.wordCorrect ?? "-"} / ${item.result?.wordTotal ?? "-"}`}</div> : <button onClick={() => openResult(item)}>確認結果を入力</button>}
          {!historyMode && <button className="assignment-delete" aria-label="削除" onClick={async () => { try { await adminApi(`?programId=${encodeURIComponent(programId)}&assignmentId=${encodeURIComponent(item.id)}`, { method: "DELETE" }); await reloadAssignments(); setNotice("課題を削除しました。"); } catch (error) { setNotice(error.message); } }}>×</button>}
        </article>
      ))}
    </div>
  );

  return (
    <main className="course-page">
      <header className="course-header"><div><span>SEASONAL ASSIGNMENTS</span><h1>講習課題管理</h1><p>生徒別の宿題・単語テスト範囲を指示し、翌週の確認結果まで管理します。</p></div><div className="course-tabs"><button className={tab === "instruction" ? "active" : ""} onClick={() => setTab("instruction")}>指示を入力</button><button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>確認待ち <b>{pending.length}</b></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>確認履歴</button></div></header>

      <section className="course-program-bar"><label>講習<select value={programId} onChange={(e) => setProgramId(e.target.value)}><option value="">講習を選択</option>{programs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{program && <div className="course-period"><strong>{formatDate(program.startDate)}〜{formatDate(program.endDate)}</strong><span>参加生徒 {participantIds.length}人</span></div>}{program && <button className="participant-button" onClick={() => setShowParticipants((value) => !value)}>参加生徒を設定</button>}<button className="new-program-button" onClick={() => setShowProgramForm((value) => !value)}>{showProgramForm ? "閉じる" : "新しい講習"}</button></section>

      {(!programs.length || showProgramForm) && <section className="course-card create-program"><h2>{programs.length ? "新しい講習を作成" : "最初の講習を作成"}</h2><input value={newProgram.name} onChange={(e) => setNewProgram({ ...newProgram, name: e.target.value })} placeholder="例：2026年 夏期講習" /><input type="date" value={newProgram.startDate} onChange={(e) => setNewProgram({ ...newProgram, startDate: e.target.value })} /><input type="date" value={newProgram.endDate} onChange={(e) => setNewProgram({ ...newProgram, endDate: e.target.value })} /><button onClick={createProgram}>作成</button></section>}

      {program && showParticipants && <section className="course-card participant-manager"><div className="participant-heading"><div><span>PARTICIPANTS</span><h2>参加生徒を設定</h2><p>タグではなく、この講習専用の名簿として保存します。</p></div><select value={participantGrade} onChange={(e) => setParticipantGrade(e.target.value)}><option value="all">全学年</option><option value="7">中1</option><option value="8">中2</option><option value="9">中3</option></select></div><div className="participant-grid">{students.filter((item) => participantGrade === "all" || Number(item.grade) === Number(participantGrade)).map((item) => <label key={item.uid} className={participantDraft.includes(item.uid) ? "selected" : ""}><input type="checkbox" checked={participantDraft.includes(item.uid)} onChange={(e) => setParticipantDraft((current) => e.target.checked ? [...new Set([...current, item.uid])] : current.filter((uid) => uid !== item.uid))} /><span>{gradeLabel(item.grade)}</span><strong>{studentName(item)}</strong></label>)}</div><div className="participant-actions"><span>{participantDraft.length}人を選択中</span><button className="primary" disabled={saving} onClick={saveParticipants}>{saving ? "保存中…" : "参加生徒を保存"}</button></div></section>}

      {program && tab === "instruction" && <section className="instruction-layout"><section className="course-card instruction-form"><div className="section-heading"><div><span>STEP 1</span><h2>課題の指示を登録</h2></div></div>{!participatingStudents.length && <p className="participant-warning">先に「参加生徒を設定」から参加者を登録してください。</p>}<label>生徒<select value={instruction.studentId} onChange={(e) => setInstruction({ ...instruction, studentId: e.target.value })}><option value="">生徒を選択</option>{participatingStudents.map((item) => <option key={item.uid} value={item.uid}>{gradeLabel(item.grade)}　{studentName(item)}</option>)}</select></label><label>指示日<input type="date" min={program.startDate} max={program.endDate} value={instruction.assignedDate} onChange={(e) => setInstruction({ ...instruction, assignedDate: e.target.value })} /></label><div className="type-switch"><button className={instruction.type === "homework" ? "active" : ""} onClick={() => setInstruction({ ...instruction, type: "homework" })}>宿題</button><button className={instruction.type === "wordTest" ? "active" : ""} onClick={() => setInstruction({ ...instruction, type: "wordTest" })}>単語テスト</button></div>{instruction.type === "homework" ? <div className="homework-fields"><label>教材<select value={instruction.material} onChange={(e) => setInstruction({ ...instruction, material: e.target.value })}>{Object.keys(HOMEWORK_MATERIALS).map((item) => <option key={item}>{item}</option>)}</select></label><label>教科<select value={instruction.subject} onChange={(e) => setInstruction({ ...instruction, subject: e.target.value })}>{materialSubjects.map((item) => <option key={item}>{item}</option>)}</select></label></div> : <label>問題数<input type="number" min="1" value={instruction.wordTotal} onChange={(e) => setInstruction({ ...instruction, wordTotal: e.target.value })} /></label>}<label>範囲<textarea rows="3" value={instruction.range} onChange={(e) => setInstruction({ ...instruction, range: e.target.value })} placeholder={instruction.type === "homework" ? "例：P.12〜19、Unit 2" : "例：No.101〜150"} /></label><label>補足メモ<textarea rows="2" value={instruction.note} onChange={(e) => setInstruction({ ...instruction, note: e.target.value })} placeholder="期限や注意事項など" /></label><div className="next-week-preview"><span>確認予定</span><strong>{formatDate(weekRange(addDays(instruction.assignedDate, 7)).start)}〜{formatDate(weekRange(addDays(instruction.assignedDate, 7)).end)}</strong><small>翌週のどこかで確認します</small></div><button className="primary" disabled={saving || !participatingStudents.length} onClick={saveInstruction}>{saving ? "保存中…" : "この指示を登録"}</button></section><section className="course-card weekly-overview"><div className="section-heading"><div><span>THIS WEEK</span><h2>今週の確認対象</h2></div><strong>{dueThisWeek.length}件</strong></div><AssignmentList items={dueThisWeek} /></section></section>}

      {program && tab === "pending" && <section className="pending-layout"><section className="course-card"><div className="list-toolbar"><div><h2>確認待ち</h2><p>指示した翌週に結果を入力します。</p></div><div><select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}><option value="all">全学年</option><option value="7">中1</option><option value="8">中2</option><option value="9">中3</option></select><select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}><option value="all">全生徒</option>{students.map((item) => <option key={item.uid} value={item.uid}>{studentName(item)}</option>)}</select></div></div><AssignmentList items={pending} /></section>{selected && <aside className="course-card result-panel"><span>STEP 2</span><h2>確認結果</h2><div className="selected-assignment"><strong>{selected.studentName}</strong><p>{selected.material}・{selected.subject}</p><b>{selected.range}</b></div>{selected.type === "homework" ? <div className="result-options">{[["submitted", "提出"], ["partial", "途中"], ["missed", "未提出"]].map(([value, label]) => <button className={result.homeworkStatus === value ? "active" : ""} key={value} onClick={() => setResult({ ...result, homeworkStatus: value })}>{label}</button>)}</div> : <div className="word-result"><label>正答数<input type="number" min="0" value={result.wordCorrect} onChange={(e) => setResult({ ...result, wordCorrect: e.target.value })} /></label><span>/</span><label>問題数<input type="number" min="1" value={result.wordTotal} onChange={(e) => setResult({ ...result, wordTotal: e.target.value })} /></label></div>}<label>確認メモ<textarea rows="3" value={result.note} onChange={(e) => setResult({ ...result, note: e.target.value })} /></label><button className="primary" disabled={saving} onClick={saveResult}>確認済みにする</button></aside>}</section>}

      {program && tab === "history" && <section className="course-card"><div className="list-toolbar"><div><h2>確認履歴</h2><p>講習期間中に指示・確認した内容を保存します。</p></div><div><select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}><option value="all">全学年</option><option value="7">中1</option><option value="8">中2</option><option value="9">中3</option></select><select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}><option value="all">全生徒</option>{students.map((item) => <option key={item.uid} value={item.uid}>{studentName(item)}</option>)}</select></div></div><AssignmentList items={history} historyMode /></section>}
      {notice && <p className="course-notice" role="status">{notice}</p>}
    </main>
  );
}
