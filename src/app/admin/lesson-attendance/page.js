"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
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
import "./attendance-adjustments.css";
import "./annual-calendar.css";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const TEACHING_DAYS = [1, 2, 3, 4, 5, 6];
const GRADE_FILTERS = [
  ["all", "全学年"],
  ["elementary", "小学生"],
  ["middle", "中学生"],
  ["1", "小1"],
  ["2", "小2"],
  ["3", "小3"],
  ["4", "小4"],
  ["5", "小5"],
  ["6", "小6"],
  ["7", "中1"],
  ["8", "中2"],
  ["9", "中3"],
];
const pad = (value) => String(value).padStart(2, "0");
const dateId = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayId = () => dateId(new Date());
const studentKey = (student) =>
  student.source === "elementary" ? `elementary_${student.id}` : `user_${student.id}`;
const gradeLabel = (grade) =>
  grade <= 6 ? `小${grade}` : ({ 7: "中1", 8: "中2", 9: "中3" }[grade] || "対象外");

const defaultTerms = (year) =>
  year === 2026
    ? {
        1: { start: "2026-03-30", end: "2026-09-02" },
        2: { start: "2026-09-03", end: "2026-12-26" },
        3: { start: "2026-12-28", end: "2027-03-27" },
      }
    : {
        1: { start: "", end: "" },
        2: { start: "", end: "" },
        3: { start: "", end: "" },
      };

function createDefaultCalendar(year, terms) {
  const candidates = Object.fromEntries(TEACHING_DAYS.map((day) => [day, []]));
  const dates = {};
  const first = terms?.[1]?.start || `${year}-04-01`;
  const last = terms?.[3]?.end || `${year + 1}-03-31`;
  const cursor = new Date(`${first}T00:00:00`);
  const end = new Date(`${last}T00:00:00`);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (TEACHING_DAYS.includes(weekday)) candidates[weekday].push(dateId(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  TEACHING_DAYS.forEach((weekday) => {
    const list = candidates[weekday];
    const removeCount = Math.max(0, list.length - 48);
    const removed = new Set(
      Array.from({ length: removeCount }, (_, index) =>
        Math.round(((index + 1) * (list.length + 1)) / (removeCount + 1)) - 1
      )
    );
    list.forEach((id, index) => {
      if (!removed.has(index)) dates[id] = true;
    });
  });
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
  const router = useRouter();
  const now = new Date();
  const initialAcademicYear = now.getMonth() + 1 <= 3 ? now.getFullYear() - 1 : now.getFullYear();
  const [year, setYear] = useState(initialAcademicYear);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState("overview");
  const [students, setStudents] = useState([]);
  const [calendar, setCalendar] = useState({});
  const [termSettings, setTermSettings] = useState(defaultTerms(initialAcademicYear));
  const [records, setRecords] = useState({});
  const [selectedKey, setSelectedKey] = useState("");
  const [recordDate, setRecordDate] = useState(todayId());
  const [status, setStatus] = useState("present");
  const [originalDate, setOriginalDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");

  const loadStudents = async () => {
    const [usersResult, elementaryResult] = await Promise.allSettled([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "adminStudents")),
    ]);
    const usersSnap = usersResult.status === "fulfilled" ? usersResult.value : { docs: [] };
    const elementarySnap =
      elementaryResult.status === "fulfilled" ? elementaryResult.value : { docs: [] };
    const middle = usersSnap.docs
      .map((item) => ({ id: item.id, source: "user", ...item.data() }))
      .filter((item) => Number(item.grade) >= 7 && Number(item.grade) <= 9);
    const elementary = elementarySnap.docs
      .map((item) => ({
        id: item.id,
        source: "elementary",
        ...item.data(),
      }))
      .filter((item) => Number(item.grade) >= 1 && Number(item.grade) <= 6);
    setStudents([...elementary, ...middle].sort((a, b) =>
      Number(a.grade || 0) - Number(b.grade || 0) ||
      String(a.realName || a.name || "").localeCompare(String(b.realName || b.name || ""), "ja")
    ));
  };

  const loadCalendar = async () => {
    const [calendarSnapshot, termSnapshot] = await Promise.all([
      getDoc(doc(db, "adminLessonCalendars", String(year))),
      getDoc(doc(db, "adminTermSettings", String(year))),
    ]);
    setCalendar(calendarSnapshot.exists() ? calendarSnapshot.data().dates || {} : {});
    setTermSettings(termSnapshot.exists() ? termSnapshot.data().terms || defaultTerms(year) : defaultTerms(year));
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

  const selectedCalendarYear = month >= 4 ? year : year + 1;
  const monthDates = useMemo(
    () => datesInMonth(selectedCalendarYear, month),
    [selectedCalendarYear, month]
  );
  const cutoff =
    selectedCalendarYear === now.getFullYear() && month === now.getMonth() + 1
      ? todayId()
      : `${selectedCalendarYear}-${pad(month)}-31`;

  const visibleStudents = useMemo(() => {
    return students.filter((student) => {
      const studentGrade = Number(student.grade);
      if (gradeFilter === "all") return true;
      if (gradeFilter === "elementary") return studentGrade >= 1 && studentGrade <= 6;
      if (gradeFilter === "middle") return studentGrade >= 7 && studentGrade <= 9;
      return studentGrade === Number(gradeFilter);
    });
  }, [students, gradeFilter]);

  useEffect(() => {
    if (selectedKey && !visibleStudents.some((student) => studentKey(student) === selectedKey)) {
      setSelectedKey("");
    }
  }, [selectedKey, visibleStudents]);

  const summaries = useMemo(() => visibleStudents.map((student) => {
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
        record.date?.startsWith(`${selectedCalendarYear}-${pad(month)}`) &&
        ["present", "makeup"].includes(record.status)
    ).length;
    const absent = Object.values(ownRecords).filter(
      (record) => record.status === "absent" && record.date?.startsWith(`${selectedCalendarYear}-${pad(month)}`)
    );
    const pending = absent.filter((record) => !record.makeupDate).length;
    return { student, key, planned, accounted, actual, missing: Math.max(0, planned - accounted), pending };
  }), [visibleStudents, records, calendar, monthDates, cutoff, selectedCalendarYear, month]);

  const selectedStudent = visibleStudents.find((student) => studentKey(student) === selectedKey);
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

  const initializeCalendar = async () => {
    const dates = createDefaultCalendar(year, termSettings);
    await setDoc(doc(db, "adminLessonCalendars", String(year)), {
      year, dates, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null,
    });
    setCalendar(dates);
    setNotice("月〜土を各48回にした原案を作成しました。休校日に合わせて調整してください。");
  };

  const saveTermSettings = async () => {
    const settings = [1, 2, 3].map((term) => termSettings[term]);
    if (settings.some((item) => !item?.start || !item?.end || item.start > item.end)) {
      return setNotice("各学期の開始日と終了日を確認してください。");
    }
    setBusy(true);
    try {
      await setDoc(doc(db, "adminTermSettings", String(year)), {
        academicYear: year,
        terms: termSettings,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      });
      setNotice(`${year}年度の学期期間を保存しました。`);
    } finally {
      setBusy(false);
    }
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

  const annualMonths = useMemo(() => {
    const start = termSettings?.[1]?.start
      ? new Date(`${termSettings[1].start}T00:00:00`)
      : new Date(year, 3, 1);
    const end = termSettings?.[3]?.end
      ? new Date(`${termSettings[3].end}T00:00:00`)
      : new Date(year + 1, 2, 31);
    const result = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      result.push({
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1,
        dates: datesInMonth(cursor.getFullYear(), cursor.getMonth() + 1),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }, [termSettings, year]);

  const termForDate = (id) => {
    for (const term of [1, 2, 3]) {
      const setting = termSettings?.[term];
      if (setting?.start && setting?.end && id >= setting.start && id <= setting.end) {
        return term;
      }
    }
    return null;
  };

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
            {[initialAcademicYear - 1, initialAcademicYear, initialAcademicYear + 1].map((value) =>
              <option key={value} value={value}>{value}年度</option>
            )}
          </select>
          {tab !== "calendar" && <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) =>
              <option key={value} value={value}>{value}月</option>
            )}
          </select>}
        </div>
      </header>

      <nav className="attendance-tabs">
        {[["overview", "照合ダッシュボード"], ["record", "出欠を記録"], ["students", "生徒・曜日設定"], ["calendar", "年間授業日"]].map(([value, label]) =>
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>
        )}
      </nav>

      {notice && <p className="attendance-notice">{notice}</p>}

      {tab !== "calendar" && (
        <div className="attendance-filter-bar" aria-label="学年フィルタ">
          {GRADE_FILTERS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={gradeFilter === value ? "active" : ""}
              onClick={() => setGradeFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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
            {visibleStudents.map((student) => {
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
          <div className="schedule-heading">
            <div><h2>通塾曜日を設定</h2><p>小学生と、既存アカウントを持つ中学生が自動で表示されます。</p></div>
            <button onClick={() => router.push("/admin/elementary-students")}>小学生の登録・編集</button>
          </div>
          <div className="schedule-list">{visibleStudents.map((student) => {
            const current = student.lessonSchedule?.weekdays || student.weekdays || [];
            return <article key={studentKey(student)}><div><strong>{student.name || student.realName || student.displayName}</strong><span>{gradeLabel(student.grade)}・{student.source === "elementary" ? "管理者登録" : "中学生アカウント"}</span></div><div className="weekday-picker">{TEACHING_DAYS.map((day) => <button key={day} className={current.includes(day) ? "active" : ""} disabled={busy} onClick={() => saveSchedule(student, current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort())}>{WEEKDAYS[day]}</button>)}</div></article>;
          })}</div>
        </section>
      )}

      {tab === "calendar" && (
        <section className="attendance-section">
          <div className="term-settings-panel">
            <div className="term-settings-heading">
              <div><h2>{year}年度 学期設定</h2><p>年度ごとに塾の学期開始日・終了日を設定します。</p></div>
              <button disabled={busy} onClick={saveTermSettings}>学期期間を保存</button>
            </div>
            <div className="term-settings-grid">
              {[1, 2, 3].map((term) => (
                <article key={term} className={`term-${term}`}>
                  <strong>{term}学期</strong>
                  <label>開始日<input type="date" value={termSettings?.[term]?.start || ""} onChange={(event) => setTermSettings((current) => ({ ...current, [term]: { ...current[term], start: event.target.value } }))} /></label>
                  <label>終了日<input type="date" value={termSettings?.[term]?.end || ""} onChange={(event) => setTermSettings((current) => ({ ...current, [term]: { ...current[term], end: event.target.value } }))} /></label>
                </article>
              ))}
            </div>
          </div>
          <div className="calendar-toolbar"><div><h2>{year}年度 年間授業カレンダー</h2><p>3月〜翌3月を一画面で表示します。色が付いた日が授業日です。</p></div><button onClick={initializeCalendar}>月〜土 各48回の原案を作成</button></div>
          <div className="weekday-counts">{weekdayCounts.map(({ weekday, count }) => <span key={weekday} className={count === 48 ? "complete" : ""}>{WEEKDAYS[weekday]}曜 <strong>{count}</strong>/48</span>)}</div>
          <div className="annual-calendar-grid">
            {annualMonths.map((item) => (
              <article className="annual-month" key={`${item.year}-${item.month}`}>
                <header><strong>{item.month}月</strong><span>{item.year}</span></header>
                <div className="annual-week">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
                <div className="annual-days">
                  {item.dates.map((date) => {
                    const lessonTerm = termForDate(date.id);
                    const enabled = Boolean(lessonTerm) && TEACHING_DAYS.includes(date.weekday);
                    return <button
                      key={date.id}
                      style={date.day === 1 ? { gridColumnStart: date.weekday + 1 } : undefined}
                      disabled={!enabled}
                      title={lessonTerm ? `${lessonTerm}学期` : "学期外"}
                      className={`${calendar[date.id] ? "lesson-day" : ""} ${lessonTerm ? `term-${lessonTerm}` : "outside-term"}`}
                      onClick={() => toggleCalendarDate(date.id)}
                    ><strong>{date.day}</strong></button>;
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
