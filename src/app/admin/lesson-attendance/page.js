"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import "./lesson-attendance.css";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const TEACHING_DAYS = [1, 2, 3, 4, 5, 6];
const pad = (value) => String(value).padStart(2, "0");
const dateId = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayId = () => dateId(new Date());
const studentKey = (student) =>
  student.source === "elementary" ? `elementary_${student.id}` : `user_${student.id}`;
const gradeLabel = (grade) =>
  grade <= 6 ? `小${grade}` : ({ 7: "中1", 8: "中2", 9: "中3" }[grade] || "対象外");

function createDefaultCalendar(year) {
  const counts = Object.fromEntries(TEACHING_DAYS.map((day) => [day, 0]));
  const dates = {};
  const cursor = new Date(year, 0, 1);
  while (cursor.getFullYear() === year) {
    const weekday = cursor.getDay();
    if (TEACHING_DAYS.includes(weekday) && counts[weekday] < 48) {
      dates[dateId(cursor)] = true;
      counts[weekday] += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function datesInMonth(year, month) {
  const result = [];
  const cursor = new Date(year, month - 1, 1);
  while (cursor.getMonth() === month - 1) {
    result.push({
      id: dateId(cursor),
      day: cursor.getDate(),
      weekday: cursor.getDay(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export default function LessonAttendancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState("overview");
  const [students, setStudents] = useState([]);
  const [calendar, setCalendar] = useState({});
  const [records, setRecords] = useState({});
  const [selectedKey, setSelectedKey] = useState("");
  const [recordDate, setRecordDate] = useState(todayId());
  const [status, setStatus] = useState("present");
  const [originalDate, setOriginalDate] = useState("");
  const [note, setNote] = useState("");
  const [newStudent, setNewStudent] = useState({ name: "", grade: 1, weekdays: [] });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadStudents = async () => {
    const [usersSnap, elementarySnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "adminStudents")),
    ]);
    const middle = usersSnap.docs
      .map((item) => ({ id: item.id, source: "user", ...item.data() }))
      .filter((item) => Number(item.grade) >= 7 && Number(item.grade) <= 9);
    const elementary = elementarySnap.docs.map((item) => ({
      id: item.id,
      source: "elementary",
      ...item.data(),
    }));
    setStudents([...elementary, ...middle].sort((a, b) =>
      String(a.realName || a.name || "").localeCompare(String(b.realName || b.name || ""), "ja")
    ));
  };

  const loadCalendar = async () => {
    const snapshot = await getDoc(doc(db, "adminLessonCalendars", String(year)));
    setCalendar(snapshot.exists() ? snapshot.data().dates || {} : {});
  };

  const loadRecords = async () => {
    const entries = await Promise.all(
      students.map(async (student) => {
        const snapshot = await getDocs(
          collection(db, "adminLessonAttendance", studentKey(student), "records")
        );
        return [studentKey(student), Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]))];
      })
    );
    setRecords(Object.fromEntries(entries));
  };

  useEffect(() => {
    loadStudents().catch(() => setNotice("生徒情報を読み込めませんでした。"));
  }, []);

  useEffect(() => {
    loadCalendar().catch(() => setNotice("授業カレンダーを読み込めませんでした。"));
  }, [year]);

  useEffect(() => {
    if (students.length) loadRecords().catch(() => setNotice("出欠記録を読み込めませんでした。"));
  }, [students]);

  const monthDates = useMemo(() => datesInMonth(year, month), [year, month]);
  const cutoff = year === now.getFullYear() && month === now.getMonth() + 1 ? todayId() : `${year}-${pad(month)}-31`;

  const summaries = useMemo(() => students.map((student) => {
    const key = studentKey(student);
    const weekdays = student.lessonSchedule?.weekdays || student.weekdays || [];
    const ownRecords = records[key] || {};
    const scheduledDates = monthDates.filter(
      (date) => calendar[date.id] && weekdays.includes(date.weekday) && date.id <= cutoff
    );
    const planned = scheduledDates.length;
    const accounted = scheduledDates.filter((date) =>
      ["present", "absent"].includes(ownRecords[date.id]?.status)
    ).length;
    const actual = Object.values(ownRecords).filter(
      (record) =>
        record.date?.startsWith(`${year}-${pad(month)}`) &&
        ["present", "makeup"].includes(record.status)
    ).length;
    const absent = Object.values(ownRecords).filter(
      (record) => record.status === "absent" && record.date?.startsWith(`${year}-${pad(month)}`)
    );
    const pending = absent.filter((record) => !record.makeupDate).length;
    return { student, key, planned, accounted, actual, missing: Math.max(0, planned - accounted), pending };
  }), [students, records, calendar, monthDates, cutoff, year, month]);

  const selectedStudent = students.find((student) => studentKey(student) === selectedKey);
  const selectedRecords = records[selectedKey] || {};

  const saveSchedule = async (student, weekdays) => {
    setBusy(true);
    try {
      const target = student.source === "elementary"
        ? doc(db, "adminStudents", student.id)
        : doc(db, "users", student.id);
      await updateDoc(target, student.source === "elementary"
        ? { weekdays, updatedAt: serverTimestamp() }
        : { lessonSchedule: { weekdays }, updatedAt: serverTimestamp() });
      await loadStudents();
      setNotice("通塾曜日を保存しました。");
    } finally {
      setBusy(false);
    }
  };

  const addElementaryStudent = async () => {
    if (!newStudent.name.trim() || !newStudent.weekdays.length) {
      return setNotice("氏名と通塾曜日を入力してください。");
    }
    setBusy(true);
    try {
      await addDoc(collection(db, "adminStudents"), {
        name: newStudent.name.trim(),
        grade: Number(newStudent.grade),
        weekdays: newStudent.weekdays,
        active: true,
        createdBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewStudent({ name: "", grade: 1, weekdays: [] });
      await loadStudents();
      setNotice("小学生を登録しました。ログインアカウントは作成していません。");
    } finally {
      setBusy(false);
    }
  };

  const removeElementaryStudent = async (student) => {
    if (!window.confirm(`${student.name}さんを管理対象から削除しますか？`)) return;
    await deleteDoc(doc(db, "adminStudents", student.id));
    await loadStudents();
  };

  const initializeCalendar = async () => {
    const dates = createDefaultCalendar(year);
    await setDoc(doc(db, "adminLessonCalendars", String(year)), {
      year, dates, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null,
    });
    setCalendar(dates);
    setNotice("月〜土を各48回にした原案を作成しました。休校日に合わせて調整してください。");
  };

  const toggleCalendarDate = async (id) => {
    const next = { ...calendar, [id]: !calendar[id] };
    if (!next[id]) delete next[id];
    setCalendar(next);
    await setDoc(doc(db, "adminLessonCalendars", String(year)), {
      year, dates: next, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null,
    }, { merge: true });
  };

  const saveAttendance = async () => {
    if (!selectedStudent || !recordDate) return setNotice("生徒と日付を選択してください。");
    if (status === "makeup" && !originalDate) return setNotice("振替元の欠席日を選択してください。");
    if (status === "makeup" && selectedRecords[originalDate]?.status !== "absent") {
      return setNotice("振替元の日には、先に欠席を登録してください。");
    }
    setBusy(true);
    try {
      const batch = writeBatch(db);
      const base = doc(db, "adminLessonAttendance", selectedKey, "records", recordDate);
      batch.set(base, {
        date: recordDate,
        status,
        originalDate: status === "makeup" ? originalDate : null,
        note: note.trim(),
        studentId: selectedStudent.id,
        studentSource: selectedStudent.source,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });
      if (status === "makeup") {
        batch.set(
          doc(db, "adminLessonAttendance", selectedKey, "records", originalDate),
          { makeupDate: recordDate, makeupCompleted: true, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
      await batch.commit();
      await loadRecords();
      setNotice(status === "makeup" ? "欠席と振替をセットで保存しました。" : "出欠を保存しました。");
      setNote("");
    } finally {
      setBusy(false);
    }
  };

  const weekdayCounts = TEACHING_DAYS.map((weekday) => ({
    weekday,
    count: Object.keys(calendar).filter((id) => new Date(`${id}T00:00:00`).getDay() === weekday).length,
  }));

  return (
    <main className="attendance-admin">
      <header className="attendance-hero">
        <div>
          <span>LESSON ATTENDANCE</span>
          <h1>授業・欠席・振替管理</h1>
          <p>予定授業数と実施記録を照合し、入力漏れと未消化の振替を見つけます。</p>
        </div>
        <div className="attendance-period">
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((value) =>
              <option key={value} value={value}>{value}年</option>
            )}
          </select>
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) =>
              <option key={value} value={value}>{value}月</option>
            )}
          </select>
        </div>
      </header>

      <nav className="attendance-tabs">
        {[["overview", "照合ダッシュボード"], ["record", "出欠を記録"], ["students", "生徒・曜日設定"], ["calendar", "年間授業日"]].map(([value, label]) =>
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>
        )}
      </nav>

      {notice && <p className="attendance-notice">{notice}</p>}

      {tab === "overview" && (
        <section className="attendance-section">
          <div className="summary-strip">
            <article><span>対象生徒</span><strong>{summaries.length}</strong></article>
            <article><span>記録漏れ候補</span><strong>{summaries.reduce((sum, item) => sum + item.missing, 0)}</strong></article>
            <article><span>振替待ち</span><strong>{summaries.reduce((sum, item) => sum + item.pending, 0)}</strong></article>
          </div>
          <div className="attendance-table-wrap">
            <table>
              <thead><tr><th>生徒</th><th>通塾曜日</th><th>予定</th><th>記録済み</th><th>実施</th><th>振替待ち</th><th>状態</th></tr></thead>
              <tbody>{summaries.map((item) => (
                <tr key={item.key} onClick={() => { setSelectedKey(item.key); setTab("record"); }}>
                  <td><strong>{item.student.name || item.student.realName || item.student.displayName}</strong><small>{gradeLabel(item.student.grade)}</small></td>
                  <td>{(item.student.lessonSchedule?.weekdays || item.student.weekdays || []).map((day) => WEEKDAYS[day]).join("・") || "未設定"}</td>
                  <td>{item.planned}回</td><td>{item.accounted}回</td><td>{item.actual}回</td><td>{item.pending}回</td>
                  <td><span className={item.missing ? "status-warning" : item.pending ? "status-pending" : "status-ok"}>{item.missing ? `${item.missing}件 要確認` : item.pending ? "振替待ち" : "正常"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "record" && (
        <section className="attendance-section record-layout">
          <aside className="record-students">
            <h2>生徒を選択</h2>
            {students.map((student) => {
              const key = studentKey(student);
              return <button key={key} className={selectedKey === key ? "active" : ""} onClick={() => setSelectedKey(key)}>
                <strong>{student.name || student.realName || student.displayName}</strong><span>{gradeLabel(student.grade)}</span>
              </button>;
            })}
          </aside>
          <div className="attendance-form">
            {!selectedStudent ? <div className="attendance-empty">左から生徒を選択してください。</div> : <>
              <div className="form-heading"><div><span>{gradeLabel(selectedStudent.grade)}</span><h2>{selectedStudent.name || selectedStudent.realName}</h2></div><input type="date" value={recordDate} onChange={(event) => setRecordDate(event.target.value)} /></div>
              <div className="status-choices">
                {[["present", "通常授業を実施"], ["absent", "欠席"], ["makeup", "振替を実施"]].map(([value, label]) =>
                  <button key={value} className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{label}</button>
                )}
              </div>
              {status === "makeup" && <label>振替元の欠席日<select value={originalDate} onChange={(event) => setOriginalDate(event.target.value)}><option value="">選択してください</option>{Object.values(selectedRecords).filter((record) => record.status === "absent" && !record.makeupDate).map((record) => <option key={record.date} value={record.date}>{record.date}</option>)}</select></label>}
              <label>メモ（任意）<textarea value={note} onChange={(event) => setNote(event.target.value)} rows="3" /></label>
              <button className="primary-action" disabled={busy} onClick={saveAttendance}>{busy ? "保存中…" : "記録を保存"}</button>
              <div className="recent-records"><h3>最近の記録</h3>{Object.values(selectedRecords).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((record) => <div key={record.date}><time>{record.date}</time><strong>{record.status === "present" ? "実施" : record.status === "absent" ? "欠席" : "振替実施"}</strong><span>{record.makeupDate ? `振替済 ${record.makeupDate}` : record.status === "absent" ? "振替待ち" : record.note}</span></div>)}</div>
            </>}
          </div>
        </section>
      )}

      {tab === "students" && (
        <section className="attendance-section">
          <div className="student-create">
            <div><span>ELEMENTARY STUDENT</span><h2>小学生を管理者登録</h2><p>生徒用ログインアカウントは作成されません。</p></div>
            <input placeholder="生徒氏名" value={newStudent.name} onChange={(event) => setNewStudent({ ...newStudent, name: event.target.value })} />
            <select value={newStudent.grade} onChange={(event) => setNewStudent({ ...newStudent, grade: Number(event.target.value) })}>{[1,2,3,4,5,6].map((value) => <option key={value} value={value}>小学{value}年</option>)}</select>
            <div className="weekday-picker">{TEACHING_DAYS.map((day) => <button key={day} className={newStudent.weekdays.includes(day) ? "active" : ""} onClick={() => setNewStudent({ ...newStudent, weekdays: newStudent.weekdays.includes(day) ? newStudent.weekdays.filter((value) => value !== day) : [...newStudent.weekdays, day].sort() })}>{WEEKDAYS[day]}</button>)}</div>
            <button className="primary-action" disabled={busy} onClick={addElementaryStudent}>登録する</button>
          </div>
          <div className="schedule-list">{students.map((student) => {
            const current = student.lessonSchedule?.weekdays || student.weekdays || [];
            return <article key={studentKey(student)}><div><strong>{student.name || student.realName || student.displayName}</strong><span>{gradeLabel(student.grade)}・{student.source === "elementary" ? "管理者登録" : "既存アカウント"}</span></div><div className="weekday-picker">{TEACHING_DAYS.map((day) => <button key={day} className={current.includes(day) ? "active" : ""} disabled={busy} onClick={() => saveSchedule(student, current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort())}>{WEEKDAYS[day]}</button>)}</div>{student.source === "elementary" && <button className="delete-student" onClick={() => removeElementaryStudent(student)}>削除</button>}</article>;
          })}</div>
        </section>
      )}

      {tab === "calendar" && (
        <section className="attendance-section">
          <div className="calendar-toolbar"><div><h2>{year}年 授業カレンダー</h2><p>色が付いた日を授業日として集計します。</p></div><button onClick={initializeCalendar}>月〜土 各48回の原案を作成</button></div>
          <div className="weekday-counts">{weekdayCounts.map(({ weekday, count }) => <span key={weekday} className={count === 48 ? "complete" : ""}>{WEEKDAYS[weekday]}曜 <strong>{count}</strong>/48</span>)}</div>
          <div className="month-calendar">
            <div className="calendar-week">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid" style={{ "--offset": new Date(year, month - 1, 1).getDay() }}>{monthDates.map((date) => <button key={date.id} style={date.day === 1 ? { gridColumnStart: date.weekday + 1 } : undefined} disabled={!TEACHING_DAYS.includes(date.weekday)} className={calendar[date.id] ? "lesson-day" : ""} onClick={() => toggleCalendarDate(date.id)}><strong>{date.day}</strong><small>{calendar[date.id] ? "授業日" : TEACHING_DAYS.includes(date.weekday) ? "休校" : ""}</small></button>)}</div>
          </div>
        </section>
      )}
    </main>
  );
}
