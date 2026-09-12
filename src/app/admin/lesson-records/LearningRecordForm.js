"use client";
import { useAcademicContext } from '@/lib/useAcademicContext';
import { resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import HomeworkReview from '@/components/HomeworkReview';
import { homeworkValue } from '@/lib/homeworkModel.mjs';

import { useEffect, useMemo, useState, useRef } from "react";
import { lessonStudent, isMiddleStudent, studentGradeLabel } from '@/lib/lessonStudents.mjs';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import "./lesson-records.css";

const HOMEWORK_OPTIONS = [
  ["none", "宿題なし"],
  ["submitted", "提出"],
  ["partial", "途中"],
  ["missed", "未提出"],
];

const WORD_OPTIONS = [
  ["notScheduled", "今回は実施しない"],
  ["completed", "実施"],
  ["pending", "欠席のため未実施"],
  ["makeup", "振替で実施"],
];

const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const gradeLabel = studentGradeLabel;

const calculateSummary = (records, year, term) => {
  const summary = {
    homework: { submitted: 0, partial: 0, missed: 0, none: 0, notEvaluated: 0 },
    attendance: { ontime: 0, late: 0, absent: 0, makeup: 0 },
    wordTest: {
      completed: 0,
      pending: 0,
      totalCorrect: 0,
      totalQuestions: 0,
      averageRate: 0,
    },
    forgot: 0,
    lessonCount: 0,
  };

  records.forEach((record) => {
    const attended = record.attendance === "present" || record.attendance === "makeup";

    if (record.attendance === "absent") summary.attendance.absent += 1;
    if (record.attendance === "makeup") summary.attendance.makeup += 1;
    if (attended) {
      summary.lessonCount += 1;
      if (record.late) summary.attendance.late += 1;
      else summary.attendance.ontime += 1;
      if (record.forgot) summary.forgot += 1;
    }

    if (record.homework === "submitted") summary.homework.submitted += 1;
    else if (record.homework === "partial") summary.homework.partial += 1;
    else if (record.homework === "missed") summary.homework.missed += 1;
    else if (record.homework === "none") summary.homework.none += 1;
    else summary.homework.notEvaluated += 1;

    if (record.wordTest?.status === "completed" || record.wordTest?.status === "makeup") {
      summary.wordTest.completed += 1;
      summary.wordTest.totalCorrect += Number(record.wordTest.correct || 0);
      summary.wordTest.totalQuestions += Number(record.wordTest.total || 0);
    } else if (record.wordTest?.status === "pending") {
      summary.wordTest.pending += 1;
    }
  });

  summary.wordTest.averageRate =
    summary.wordTest.totalQuestions > 0
      ? Math.round(
          (summary.wordTest.totalCorrect / summary.wordTest.totalQuestions) * 1000
        ) / 10
      : 0;

  const homeworkTotal =
    summary.homework.submitted + summary.homework.partial + summary.homework.missed;
  const attendanceTotal = summary.attendance.ontime + summary.attendance.late;
  const homeworkRate =
    homeworkTotal > 0
      ? (summary.homework.submitted + summary.homework.partial * 0.5) / homeworkTotal
      : 1;
  const attendanceRate =
    attendanceTotal > 0 ? summary.attendance.ontime / attendanceTotal : 1;

  summary.behaviorScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        homeworkRate * 40 +
          attendanceRate * 40 +
          20 -
          summary.attendance.late * 5 -
          summary.forgot * 4
      )
    )
  );
  summary.year = String(year);
  summary.term = `${term}学期`;
  return summary;
};

export default function LearningRecordForm({ onDirtyChange = () => {}, onBusyChange = () => {} }) {
  const academic = useAcademicContext();
  const currentYear = new Date().getFullYear();
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("all");
  const [academicYear, setAcademicYear] = useState(currentYear);
  const [term, setTerm] = useState(1);
  const [date, setDate] = useState(today());
  const [attendance, setAttendance] = useState("present");
  const [originalLessonDate, setOriginalLessonDate] = useState("");
  const [homework, setHomework] = useState("none");
  const [wordStatus, setWordStatus] = useState("notScheduled");
  const [wordCorrect, setWordCorrect] = useState("");
  const [wordTotal, setWordTotal] = useState("20");
  const [late, setLate] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [behaviorNote, setBehaviorNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  const [recordReady, setRecordReady] = useState(false);
  const [homeworkReady, setHomeworkReady] = useState(false);
  const [homeworkReview, setHomeworkReview] = useState(null);
  const [commentIds, setCommentIds] = useState([]);
  const loadVersion = useRef(0);
  const [notice, setNotice] = useState("");

  const termId = `${academicYear}_${term}`;
  useEffect(() => {
    if (!academic.settings.length || !date) return;
    try {
      const selected = resolveAcademicTerm(academic.settings, date);
      setAcademicYear(selected.year);
      setTerm(selected.term);
    } catch (error) { setNotice(error.message); }
  }, [academic.settings, date]);

  useEffect(() => {
    Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'adminStudents'))]).then(([snapshot, elementary]) => {
      setStudents(
        [...snapshot.docs.map(item => lessonStudent(item.id, item.data())), ...elementary.docs.map(item => lessonStudent(item.id, item.data(), 'elementary'))].filter(Boolean)
          .sort(
            (a, b) =>
              Number(a.grade || 0) - Number(b.grade || 0) ||
              String(a.realName || a.displayName || "").localeCompare(
                String(b.realName || b.displayName || ""),
                "ja"
              )
          )
      );
    }).catch(() => setNotice('生徒一覧を取得できませんでした。再読み込みしてください。'));
  }, []);

  useEffect(() => {
    if (attendance === "absent") {
      setHomework("notEvaluated");
      setWordStatus("pending");
      setLate(false);
      setForgot(false);
    } else if (homework === "notEvaluated") {
      setHomework("none");
    }
  }, [attendance, homework]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return students.filter((student) => {
      if (grade !== "all" && Number(student.grade) !== Number(grade)) return false;
      if (!keyword) return true;
      return `${student.realName || ""} ${student.displayName || ""}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [students, search, grade]);

  const selectedStudent = students.find((student) => student.uid === studentId);

  const resetRecordForm = () => {
    setHomeworkReview(null); setCommentIds([]);
    setAttendance("present");
    setOriginalLessonDate("");
    setHomework("none");
    setWordStatus("notScheduled");
    setWordCorrect("");
    setWordTotal(String(selectedStudent?.wordTestQuestionCount || 20));
    setLate(false);
    setForgot(false);
    setBehaviorNote("");
  };

  const loadExistingRecord = async (uid, selectedDate, selectedTermId) => {
    const version = ++loadVersion.current;
    setRecordReady(false);
    const student = students.find(item => item.uid === uid);
    if (!student) return;
    const middle = isMiddleStudent(student);
    const recordRef = middle ? doc(db, 'users', student.id, 'lessonTerms', selectedTermId, 'records', selectedDate) : doc(db, 'adminLessonAttendance', student.uid, 'records', selectedDate);
    const snapshot = await getDoc(recordRef);
    let legacy = null;
    if (!snapshot.exists() && student.source === 'user' && !middle) {
      const old = await getDoc(doc(db, 'users', student.id, 'classAttendance', selectedDate));
      if (old.exists() && old.data().attended) legacy = { attendance: 'present' };
    }
    if (version !== loadVersion.current) return;
    setRecordReady(true);
    if (!snapshot.exists()) {
      resetRecordForm();
      if (legacy) setNotice('旧形式の出席記録を読み込みました。');
      return;
    }

    const raw = snapshot.data();
    const record = middle ? raw : { ...raw.learningRecord, attendance: raw.status, originalLessonDate: raw.originalDate, behaviorNote: raw.learningRecord?.behaviorNote ?? raw.note };
    setHomeworkReview(record.homeworkReview || null);
    setCommentIds(record.commentIds || []);
    setAttendance(record.attendance || "present");
    setOriginalLessonDate(record.originalLessonDate || "");
    setHomework(record.homework || "none");
    setWordStatus(record.wordTest?.status || "notScheduled");
    setWordCorrect(String(record.wordTest?.correct ?? ""));
    setWordTotal(String(record.wordTest?.total ?? selectedStudent?.wordTestQuestionCount ?? 20));
    setLate(Boolean(record.late));
    setForgot(Boolean(record.forgot));
    setBehaviorNote(record.behaviorNote || "");
    setNotice("この日付の保存済み記録を読み込みました。");
  };

  useEffect(() => {
    setNotice("");
    if (studentId && date) loadExistingRecord(studentId, date, termId).catch(() => { setRecordReady(false); setNotice('保存済み記録を取得できませんでした。再読み込みしてください。'); });
    return () => { loadVersion.current++; };
  }, [studentId, date, termId]);

  const saveRecord = async () => {
    if (!recordReady || !homeworkReady || !selectedStudent || saving) return;
    try {
      if (academic.loading || academic.error) throw new Error(academic.error || '学期設定を読み込み中です。');
      if (resolveAcademicTerm(academic.settings, date).id !== termId) throw new Error('授業日と選択した学期が一致しません。');
    } catch (error) { return setNotice(error.message); }
    if (!studentId || !date) return setNotice("生徒と授業日を選択してください。");
    if (
      (wordStatus === "completed" || wordStatus === "makeup") &&
      (!wordTotal || Number(wordCorrect) > Number(wordTotal))
    ) {
      return setNotice("単語テストの点数を確認してください。");
    }
    if (attendance === "makeup" && !originalLessonDate) {
      return setNotice("振替元の授業日を入力してください。");
    }

    setSaving(true);
    setNotice("");
    try {
      const weekId = `${academicYear}-W${String(getWeekNumber(date)).padStart(2, "0")}`;
      const recordsRef = collection(
        db,
        "users",
        selectedStudent.id,
        "lessonTerms",
        termId,
        "records"
      );
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("管理者のログイン情報がありません。");
      if (!isMiddleStudent(selectedStudent)) {
        const response = await fetch('/api/admin/lesson-attendance', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'save', student: { id: selectedStudent.id, source: selectedStudent.source, grade: selectedStudent.grade }, date, status: attendance, originalDate: originalLessonDate, note: behaviorNote, homeworkReview, commentIds,
            learningRecord: { homework: attendance === 'absent' ? 'notEvaluated' : homework, wordTest: { status: wordStatus, correct: wordCorrect, total: wordTotal }, late: attendance !== 'absent' && late, forgot: attendance !== 'absent' && forgot, behaviorNote } }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '保存できませんでした。');
        onDirtyChange(false);
        setNotice(`学習記録と出欠を保存しました。${result.pointDelta ? `出席ポイント ${result.pointDelta > 0 ? '+' : ''}${result.pointDelta}pt` : '宿題・単語テストのポイント付与はありません。'}`);
        return;
      }
      const response = await fetch("/api/admin/lesson-records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: selectedStudent.id,
          homeworkReview, commentIds,
          date,
          termId,
          weekId,
          record: {
          date,
          termId,
          weekId,
          attendance,
          originalLessonDate: attendance === "makeup" ? originalLessonDate : null,
          homework: attendance === "absent" ? "notEvaluated" : homework,
          wordTest: {
            status: wordStatus,
            correct:
              wordStatus === "completed" || wordStatus === "makeup"
                ? Number(wordCorrect || 0)
                : null,
            total:
              wordStatus === "completed" || wordStatus === "makeup"
                ? Number(wordTotal || 0)
                : null,
          },
          late: attendance === "absent" ? false : late,
          forgot: attendance === "absent" ? false : forgot,
          behaviorNote: behaviorNote.trim(),
          },
        }),
      });
      const saveResult = await response.json();
      if (!response.ok) throw new Error(saveResult.error || "保存に失敗しました。");
      if (wordStatus === "completed" || wordStatus === "makeup") {
        setStudents((current) => current.map((student) =>
          student.uid === studentId
            ? { ...student, wordTestQuestionCount: Number(wordTotal) }
            : student
        ));
      }

      const recordsSnapshot = await getDocs(recordsRef);
      const summary = calculateSummary(
        recordsSnapshot.docs.map((item) => item.data()),
        academicYear,
        term
      );
      await setDoc(
        doc(db, "users", selectedStudent.id, "behaviorSummary", termId),
        { ...summary, updatedAt: serverTimestamp() },
        { merge: true }
      );
      onDirtyChange(false);
      const rewardLabels = [];
      if (saveResult.rewards?.homework !== null) {
        rewardLabels.push(`宿題 ${saveResult.rewards.homework >= 0 ? "+" : ""}${saveResult.rewards.homework}pt/EXP`);
      }
      if (saveResult.rewards?.wordTest !== null) {
        rewardLabels.push(`単語 ${saveResult.rewards.wordTest >= 0 ? "+" : ""}${saveResult.rewards.wordTest}pt/EXP`);
      }
      setNotice(`保存し、学期集計を更新しました。${rewardLabels.length ? `（${rewardLabels.join("、")}）` : "（今週の報酬は付与済み）"}`);
    } catch (error) {
      console.error(error);
      setNotice(error.message || "保存に失敗しました。通信状態を確認してください。");
    } finally {
      setSaving(false);
    }
  };

  if (academic.loading) return <p>年度・学期を確認中です…</p>;
  if (academic.error) return <p role="alert">{academic.error} <a href="/admin/settings">授業設定を確認</a></p>;
  return (
    <main className="lesson-page" onChange={event => { if (event.target.closest('fieldset')) onDirtyChange(true); }} onClick={event => { if (event.target.closest('fieldset button')) onDirtyChange(true); }}>
      <header className="lesson-header">
        <div>
          <span>LESSON RECORDS</span>
          <h1>学習記録</h1>
          <p>出欠・宿題・単語テスト・生活態度を学期単位で記録します。</p>
        </div>
        <div className="term-controls">
          <select disabled={saving} value={academicYear} onChange={(e) => { setRecordReady(false); setAcademicYear(Number(e.target.value)); }}>
            {academic.settings.map(item => item.year).sort((a, b) => a - b).map((year) => (
              <option key={year} value={year}>{year}年度</option>
            ))}
          </select>
          <select disabled={saving} value={term} onChange={(e) => { setRecordReady(false); setTerm(Number(e.target.value)); }}>
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>{value}学期</option>
            ))}
          </select>
        </div>
      </header>

      <section className="lesson-layout">
        <aside className="student-picker">
          <h2>生徒を選択</h2>
          <input
            type="search"
            placeholder="名前で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="all">全学年</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{gradeLabel(value)}</option>
            ))}
          </select>
          <div className="student-list">
            {filteredStudents.map((student) => (
              <button
                key={student.uid}
                className={studentId === student.uid ? "active" : ""}
                disabled={saving}
                onClick={() => { if (studentId !== student.uid) { setRecordReady(false); setStudentId(student.uid); } }}
              >
                <strong>{student.realName || student.displayName || "名前未設定"}</strong>
                <span>{gradeLabel(student.grade)}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="record-panel">
          {!selectedStudent ? (
            <div className="record-empty">左の一覧から生徒を選択してください。</div>
          ) : (
            <>
              <div className="record-title">
                <div>
                  <span>{gradeLabel(selectedStudent.grade)}</span>
                  <h2>{selectedStudent.realName || selectedStudent.displayName}</h2>
                </div>
                <label>
                  授業日
                  <input disabled={saving} type="date" value={date} onChange={(e) => { setRecordReady(false); setDate(e.target.value); }} />
                </label>
              </div>
              {!isMiddleStudent(selectedStudent) && <p>宿題・単語テストは記録のみです。小学生はポイント付与なし、高校生は既存の通常出席ポイントのみ適用します。</p>}

              <fieldset>
                <legend>出席状況</legend>
                <div className="choice-grid three">
                  {[
                    ["present", "出席"],
                    ["absent", "欠席"],
                    ["makeup", "振替出席"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={attendance === value ? "selected" : ""}
                      onClick={() => setAttendance(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {attendance === "makeup" && (
                  <label className="inline-field">
                    振替元の授業日
                    <input
                      type="date"
                      value={originalLessonDate}
                      onChange={(e) => setOriginalLessonDate(e.target.value)}
                    />
                  </label>
                )}
              </fieldset>

              <fieldset className={attendance === "absent" ? "disabled-section" : ""}>
                <legend>宿題</legend>
                <HomeworkReview studentKey={selectedStudent.uid} date={date} value={homeworkReview} onChange={value => { setHomeworkReview(value); if (value) setHomework(homeworkValue(value.status)); onDirtyChange(true); }} commentIds={commentIds} onCommentsChange={value => { setCommentIds(value); onDirtyChange(true); }} onReadyChange={setHomeworkReady} />
                {!homeworkReview?.assignmentId && <>
                {attendance === "absent" ? (
                  <p>欠席のため評価対象外です。</p>
                ) : (
                  <div className="choice-grid four">
                    {HOMEWORK_OPTIONS.map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={homework === value ? "selected" : ""}
                        onClick={() => setHomework(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                </>}
              </fieldset>

              <fieldset>
                <legend>単語テスト（週1回）</legend>
                <select value={wordStatus} onChange={(e) => setWordStatus(e.target.value)}>
                  {WORD_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {(wordStatus === "completed" || wordStatus === "makeup") && (
                  <div className="score-inputs">
                    <label>正答数<input type="number" min="0" value={wordCorrect} onChange={(e) => setWordCorrect(e.target.value)} /></label>
                    <span>/</span>
                    <label>問題数<input type="number" min="1" value={wordTotal} onChange={(e) => setWordTotal(e.target.value)} /></label>
                  </div>
                )}
                {(wordStatus === "completed" || wordStatus === "makeup") && (
                  <p className="word-total-hint">問題数はこの生徒の次回入力にも引き継がれます。</p>
                )}
              </fieldset>

              <fieldset className={attendance === "absent" ? "disabled-section" : ""}>
                <legend>生活態度</legend>
                <div className="check-row">
                  <label><input type="checkbox" checked={late} disabled={attendance === "absent"} onChange={(e) => setLate(e.target.checked)} />遅刻</label>
                  <label><input type="checkbox" checked={forgot} disabled={attendance === "absent"} onChange={(e) => setForgot(e.target.checked)} />忘れ物</label>
                </div>
                <textarea
                  rows="3"
                  placeholder="教室内部用メモ（生徒・保護者には公開しません）"
                  value={behaviorNote}
                  onChange={(e) => setBehaviorNote(e.target.value)}
                />
              </fieldset>

              {notice && <p className="record-notice" role="status">{notice}</p>}
              <button className="record-save" onClick={saveRecord} disabled={saving || !recordReady || !homeworkReady}>
                {saving ? "保存中…" : "この記録を保存"}
              </button>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function getWeekNumber(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const first = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date - first) / 86400000 + first.getDay() + 1) / 7);
}
