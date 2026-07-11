"use client";

import { useEffect, useMemo, useState } from "react";
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

const gradeLabel = (grade) =>
  ({ 7: "中1", 8: "中2", 9: "中3" }[grade] || "学年未設定");

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

export default function LessonRecordsPage() {
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
  const [notice, setNotice] = useState("");

  const termId = `${academicYear}_${term}`;

  useEffect(() => {
    getDocs(collection(db, "users")).then((snapshot) => {
      setStudents(
        snapshot.docs
          .map((item) => ({ uid: item.id, ...item.data() }))
          .filter((student) => Number(student.grade) >= 7 && Number(student.grade) <= 9)
          .sort(
            (a, b) =>
              Number(a.grade || 0) - Number(b.grade || 0) ||
              String(a.realName || a.displayName || "").localeCompare(
                String(b.realName || b.displayName || ""),
                "ja"
              )
          )
      );
    });
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
    const recordRef = doc(
      db,
      "users",
      uid,
      "lessonTerms",
      selectedTermId,
      "records",
      selectedDate
    );
    const snapshot = await getDoc(recordRef);
    if (!snapshot.exists()) {
      resetRecordForm();
      return;
    }

    const record = snapshot.data();
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
    if (studentId && date) loadExistingRecord(studentId, date, termId);
  }, [studentId, date, termId]);

  const saveRecord = async () => {
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
        studentId,
        "lessonTerms",
        termId,
        "records"
      );
      const beforeSaveSnapshot = await getDocs(recordsRef);
      const duplicateWordTest = beforeSaveSnapshot.docs.some((item) => {
        const record = item.data();
        return (
          item.id !== date &&
          record.weekId === weekId &&
          (record.wordTest?.status === "completed" ||
            record.wordTest?.status === "makeup") &&
          (wordStatus === "completed" || wordStatus === "makeup")
        );
      });
      if (duplicateWordTest) {
        setNotice("この週の単語テストはすでに記録されています。");
        setSaving(false);
        return;
      }

      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("管理者のログイン情報がありません。");
      const response = await fetch("/api/admin/lesson-records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: studentId,
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
        doc(db, "users", studentId, "behaviorSummary", termId),
        { ...summary, updatedAt: serverTimestamp() },
        { merge: true }
      );
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

  return (
    <main className="lesson-page">
      <header className="lesson-header">
        <div>
          <span>LESSON RECORDS</span>
          <h1>学習記録</h1>
          <p>出欠・宿題・単語テスト・生活態度を学期単位で記録します。</p>
        </div>
        <div className="term-controls">
          <select value={academicYear} onChange={(e) => setAcademicYear(Number(e.target.value))}>
            {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
              <option key={year} value={year}>{year}年度</option>
            ))}
          </select>
          <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
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
            {[7, 8, 9].map((value) => (
              <option key={value} value={value}>{gradeLabel(value)}</option>
            ))}
          </select>
          <div className="student-list">
            {filteredStudents.map((student) => (
              <button
                key={student.uid}
                className={studentId === student.uid ? "active" : ""}
                onClick={() => setStudentId(student.uid)}
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
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
              </div>

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
                  placeholder="必要な場合だけメモを入力"
                  value={behaviorNote}
                  onChange={(e) => setBehaviorNote(e.target.value)}
                />
              </fieldset>

              {notice && <p className="record-notice" role="status">{notice}</p>}
              <button className="record-save" onClick={saveRecord} disabled={saving}>
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
