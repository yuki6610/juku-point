"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteField,
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
  ["high", "高校生"],
  ["1", "小1"],
  ["2", "小2"],
  ["3", "小3"],
  ["4", "小4"],
  ["5", "小5"],
  ["6", "小6"],
  ["7", "中1"],
  ["8", "中2"],
  ["9", "中3"],
  ["10", "高1"],
  ["11", "高2"],
  ["12", "高3"],
];
const pad = (value) => String(value).padStart(2, "0");
const dateId = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayId = () => dateId(new Date());
const studentKey = (student) =>
  student.source === "elementary" ? `elementary_${student.id}` : `user_${student.id}`;
const isMiddleSchool = (student) => {
  const grade = Number(student.grade);
  return grade >= 7 && grade <= 9;
};
const gradeLabel = (grade) =>
  grade <= 6 ? `小${grade}` : ({ 7: "中1", 8: "中2", 9: "中3", 10: "高1", 11: "高2", 12: "高3" }[grade] || "対象外");
const getLessonStartDate = (student) =>
  student.lessonSchedule?.startDate ||
  student.lessonStartDate ||
  student.enrollmentDate ||
  student.joinedAt ||
  "";

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

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekEndId(date) {
  const weekday = date.getDay();
  return dateId(addDays(date, 6 - weekday));
}

function normalizeStatus(value) {
  if (value === "欠席" || value === "absent") return "absent";
  if (value === "振替" || value === "振替実施" || value === "makeup") return "makeup";
  return "present";
}

function normalizeAttendanceRecord(record, docId = "", fallback = {}) {
  return {
    ...record,
    date: record.date || docId,
    status: normalizeStatus(record.status || record.attendance),
    originalDate: record.originalLessonDate || record.originalDate || null,
    makeupDate: record.makeupDate || null,
    makeupCompleted: Boolean(record.makeupCompleted),
    note: record.behaviorNote || record.note || "",
    studentId: record.studentId || fallback.studentId || null,
    studentSource: record.studentSource || fallback.studentSource || null,
    source: fallback.source || record.source || "adminLessonAttendance",
  };
}

function mergeAttendanceRecord(records, record) {
  if (!record?.date) return records;
  const current = records[record.date];
  if (!current) {
    records[record.date] = record;
    return records;
  }
  const statusPriority = { present: 1, makeup: 2, absent: 3 };
  const keepStatus =
    (statusPriority[current.status] || 0) > (statusPriority[record.status] || 0)
      ? current.status
      : record.status;
  records[record.date] = {
    ...current,
    ...record,
    status: keepStatus,
    originalDate: record.originalDate || current.originalDate || null,
    makeupDate: record.makeupDate || current.makeupDate || null,
    makeupCompleted: Boolean(record.makeupCompleted || current.makeupCompleted),
    note: record.note || current.note || "",
  };
  return records;
}

function linkMakeupRecords(records) {
  const linked = { ...records };
  Object.values(linked).forEach((record) => {
    if (record.status !== "makeup" || !record.originalDate || !linked[record.originalDate]) return;
    linked[record.originalDate] = {
      ...linked[record.originalDate],
      makeupDate: record.date,
      makeupCompleted: true,
    };
  });
  return linked;
}

function termIdForDate(id, terms, fallbackYear) {
  for (const term of [1, 2, 3]) {
    const setting = terms?.[term];
    if (setting?.start && setting?.end && id >= setting.start && id <= setting.end) {
      return `${fallbackYear}_${term}`;
    }
  }
  return null;
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
  const [calendarDirty, setCalendarDirty] = useState(false);

  const loadStudents = async () => {
    const [usersResult, elementaryResult] = await Promise.allSettled([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "adminStudents")),
    ]);
    const usersSnap = usersResult.status === "fulfilled" ? usersResult.value : { docs: [] };
    const elementarySnap =
      elementaryResult.status === "fulfilled" ? elementaryResult.value : { docs: [] };
    const secondary = usersSnap.docs
      .map((item) => ({ id: item.id, source: "user", ...item.data() }))
      .filter((item) => Number(item.grade) >= 7 && Number(item.grade) <= 12);
    const elementary = elementarySnap.docs
      .map((item) => ({
        id: item.id,
        source: "elementary",
        ...item.data(),
      }))
      .filter((item) => Number(item.grade) >= 1 && Number(item.grade) <= 6);
    setStudents([...elementary, ...secondary].sort((a, b) =>
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
    setCalendarDirty(false);
    setTermSettings(termSnapshot.exists() ? termSnapshot.data().terms || defaultTerms(year) : defaultTerms(year));
  };

  const loadRecords = async (targetStudents = students) => {
    const monthStart = academicRecordStart;
    const monthEnd = academicRecordEnd;
    const entries = await Promise.all(
      targetStudents.map(async (student) => {
        if (isMiddleSchool(student)) {
          const [termSnapshots, directSnapshot] = await Promise.all([
            Promise.all(
              [1, 2, 3].map((term) =>
                getDocs(collection(db, "users", student.id, "lessonTerms", `${year}_${term}`, "records"))
              )
            ),
            getDocs(collection(db, "adminLessonAttendance", studentKey(student), "records")),
          ]);
          const mapped = {};
          termSnapshots.forEach((snapshot) => {
            snapshot.docs.forEach((item) => {
              const record = normalizeAttendanceRecord(item.data(), item.id, {
                studentId: student.id,
                studentSource: "user",
                source: "lesson-records",
              });
              if (!record.date || record.date < monthStart || record.date > monthEnd) return;
              mergeAttendanceRecord(mapped, record);
            });
          });
          directSnapshot.docs.forEach((item) => {
            const record = normalizeAttendanceRecord(item.data(), item.id, {
              studentId: student.id,
              studentSource: student.source,
              source: "adminLessonAttendance",
            });
            if (!record.date || record.date < monthStart || record.date > monthEnd) return;
            mergeAttendanceRecord(mapped, record);
          });
          return [studentKey(student), linkMakeupRecords(mapped)];
        }

        const snapshot = await getDocs(collection(db, "adminLessonAttendance", studentKey(student), "records"));
        const mapped = {};
        snapshot.docs.forEach((item) => {
          const record = normalizeAttendanceRecord(item.data(), item.id, {
            studentId: student.id,
            studentSource: student.source,
            source: "adminLessonAttendance",
          });
          if (!record.date || record.date < monthStart || record.date > monthEnd) return;
          mergeAttendanceRecord(mapped, record);
        });
        return [studentKey(student), linkMakeupRecords(mapped)];
      })
    );
    setRecords((current) => ({ ...current, ...Object.fromEntries(entries) }));
  };

  const loadStudentRecords = async (key) => {
    if (!key) return;
    const student = students.find((item) => studentKey(item) === key);
    if (student && isMiddleSchool(student)) {
      const [termSnapshots, directSnapshot] = await Promise.all([
        Promise.all(
          [1, 2, 3].map((term) =>
            getDocs(collection(db, "users", student.id, "lessonTerms", `${year}_${term}`, "records"))
          )
        ),
        getDocs(collection(db, "adminLessonAttendance", key, "records")),
      ]);
      const mapped = {};
      termSnapshots.forEach((snapshot) => {
        snapshot.docs.forEach((item) => {
          const record = normalizeAttendanceRecord(item.data(), item.id, {
            studentId: student.id,
            studentSource: "user",
            source: "lesson-records",
          });
          if (record.date) mergeAttendanceRecord(mapped, record);
        });
      });
      directSnapshot.docs.forEach((item) => {
        const record = normalizeAttendanceRecord(item.data(), item.id, {
          studentId: student.id,
          studentSource: student.source,
          source: "adminLessonAttendance",
        });
        if (record.date) mergeAttendanceRecord(mapped, record);
      });
      setRecords((current) => ({ ...current, [key]: linkMakeupRecords(mapped) }));
      return;
    }
    const snapshot = await getDocs(
      collection(db, "adminLessonAttendance", key, "records")
    );
    const mapped = {};
    snapshot.docs.forEach((item) => {
      const record = normalizeAttendanceRecord(item.data(), item.id, {
        studentId: student?.id || null,
        studentSource: student?.source || null,
        source: "adminLessonAttendance",
      });
      if (record.date) mergeAttendanceRecord(mapped, record);
    });
    setRecords((current) => ({
      ...current,
      [key]: linkMakeupRecords(mapped),
    }));
  };

  useEffect(() => {
    loadStudents().catch(() => setNotice("生徒情報を読み込めませんでした。"));
  }, []);

  useEffect(() => {
    loadCalendar().catch(() => setNotice("授業カレンダーを読み込めませんでした。"));
  }, [year]);

  const selectedCalendarYear = month >= 4 ? year : year + 1;
  const monthDates = useMemo(
    () => datesInMonth(selectedCalendarYear, month),
    [selectedCalendarYear, month]
  );
  const cutoff =
    selectedCalendarYear === now.getFullYear() && month === now.getMonth() + 1
      ? todayId()
      : `${selectedCalendarYear}-${pad(month)}-31`;
  const currentWeekEnd = weekEndId(now);
  const academicRecordStart = termSettings?.[1]?.start || `${year}-04-01`;
  const academicRecordEnd = termSettings?.[3]?.end || `${year + 1}-03-31`;
  const academicDueEnd =
    currentWeekEnd < academicRecordStart
      ? ""
      : currentWeekEnd <= academicRecordEnd
        ? currentWeekEnd
        : academicRecordEnd;

  const visibleStudents = useMemo(() => {
    return students.filter((student) => {
      const studentGrade = Number(student.grade);
      if (gradeFilter === "all") return true;
      if (gradeFilter === "elementary") return studentGrade >= 1 && studentGrade <= 6;
      if (gradeFilter === "middle") return studentGrade >= 7 && studentGrade <= 9;
      if (gradeFilter === "high") return studentGrade >= 10 && studentGrade <= 12;
      return studentGrade === Number(gradeFilter);
    });
  }, [students, gradeFilter]);
  useEffect(() => {
    if (selectedKey && !visibleStudents.some((student) => studentKey(student) === selectedKey)) {
      setSelectedKey("");
    }
  }, [selectedKey, visibleStudents]);

  useEffect(() => {
    if (!visibleStudents.length || tab === "calendar" || tab === "students") return;
    loadRecords(visibleStudents).catch(() => setNotice("出欠記録を読み込めませんでした。"));
  }, [visibleStudents, selectedCalendarYear, month, cutoff, tab, academicRecordStart, academicRecordEnd]);

  useEffect(() => {
    if (tab !== "record" || !selectedKey) return;
    loadStudentRecords(selectedKey).catch(() => setNotice("選択した生徒の記録を読み込めませんでした。"));
  }, [tab, selectedKey]);

  const summaries = useMemo(() => visibleStudents.map((student) => {
    const key = studentKey(student);
    const weekdays = student.lessonSchedule?.weekdays || student.weekdays || [];
    const ownRecords = records[key] || {};
    const lessonStartDate = getLessonStartDate(student);
    const scheduledDates = monthDates.filter(
      (date) =>
        calendar[date.id] === true &&
        weekdays.includes(date.weekday) &&
        date.id <= cutoff &&
        (!lessonStartDate || date.id >= lessonStartDate)
    );
    const planned = scheduledDates.length;
    const accounted = scheduledDates.filter((date) =>
      ["present", "absent"].includes(ownRecords[date.id]?.status)
    ).length;
    const actual = Object.values(ownRecords).filter(
      (record) =>
        record.date?.startsWith(`${selectedCalendarYear}-${pad(month)}`) &&
        (!lessonStartDate || record.date >= lessonStartDate) &&
        ["present", "makeup"].includes(record.status)
    ).length;
    const absent = Object.values(ownRecords).filter(
      (record) =>
        record.status === "absent" &&
        record.date >= academicRecordStart &&
        (!academicDueEnd || record.date <= academicDueEnd) &&
        (!lessonStartDate || record.date >= lessonStartDate)
    );
    const makeup = Object.values(ownRecords).filter(
      (record) =>
        record.status === "makeup" &&
        record.date >= academicRecordStart &&
        (!academicDueEnd || record.date <= academicDueEnd) &&
        (!lessonStartDate || record.date >= lessonStartDate)
    ).length;
    const pending = absent.filter((record) => !record.makeupDate).length;
    const terms = [1, 2, 3].map((term) => {
      const setting = termSettings?.[term];
      if (!setting?.start || !setting?.end) {
        return { term, planned: 0, actual: 0, absent: 0, balance: 0 };
      }
      const start = lessonStartDate && lessonStartDate > setting.start ? lessonStartDate : setting.start;
      const end = setting.end;
      if (start > end) {
        return { term, planned: 0, actual: 0, absent: 0, balance: 0 };
      }
      const countScheduledLessons = (rangeEnd) => Object.keys(calendar).filter((id) => {
        const weekday = new Date(`${id}T00:00:00`).getDay();
        return calendar[id] === true && weekdays.includes(weekday) && id >= start && id <= rangeEnd;
      }).length;
      const termPlanned = countScheduledLessons(end);
      const dueEnd = currentWeekEnd < start ? "" : currentWeekEnd <= end ? currentWeekEnd : end;
      const duePlanned = dueEnd ? countScheduledLessons(dueEnd) : 0;
      const termRecords = Object.values(ownRecords).filter((record) =>
        record.date && record.date >= start && record.date <= end
      );
      const dueRecords = dueEnd
        ? termRecords.filter((record) => record.date <= dueEnd)
        : [];
      const dueActual = dueRecords.filter((record) =>
        ["present", "makeup"].includes(record.status)
      ).length;
      const termActual = termRecords.filter((record) =>
        ["present", "makeup"].includes(record.status)
      ).length;
      const termAbsent = termRecords.filter((record) => record.status === "absent").length;
      return {
        term,
        planned: duePlanned,
        totalPlanned: termPlanned,
        duePlanned,
        actual: dueActual,
        totalActual: termActual,
        absent: termAbsent,
        balance: duePlanned - dueActual,
      };
    });
    return { student, key, planned, accounted, actual, absent: absent.length, makeup, missing: Math.max(0, planned - accounted), pending, terms, lessonStartDate };
  }), [visibleStudents, records, calendar, monthDates, cutoff, selectedCalendarYear, month, termSettings, currentWeekEnd, academicRecordStart, academicDueEnd]);

  const selectedStudent = visibleStudents.find((student) => studentKey(student) === selectedKey);
  const selectedRecords = records[selectedKey] || {};
  const selectedRecordList = Object.values(selectedRecords)
    .filter((record) => record.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  const saveSchedule = async (student, weekdays) => {
    setBusy(true);
    try {
      const target = student.source === "elementary"
        ? doc(db, "adminStudents", student.id)
        : doc(db, "users", student.id);
      await updateDoc(target, student.source === "elementary"
        ? { weekdays, updatedAt: serverTimestamp() }
        : { lessonSchedule: { ...(student.lessonSchedule || {}), weekdays }, updatedAt: serverTimestamp() });
      await loadStudents();
      setNotice("通塾曜日を保存しました。");
    } catch (error) {
      console.error(error);
      setNotice("通塾曜日を保存できませんでした。管理者権限または通信状態を確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const saveLessonStartDate = async (student, startDate) => {
    setBusy(true);
    try {
      const target = student.source === "elementary"
        ? doc(db, "adminStudents", student.id)
        : doc(db, "users", student.id);
      const currentWeekdays = student.lessonSchedule?.weekdays || student.weekdays || [];
      await updateDoc(target, student.source === "elementary"
        ? { lessonStartDate: startDate || null, updatedAt: serverTimestamp() }
        : { lessonSchedule: { ...(student.lessonSchedule || {}), weekdays: currentWeekdays, startDate: startDate || null }, updatedAt: serverTimestamp() });
      await loadStudents();
      setNotice("授業数の計算開始日を保存しました。");
    } catch (error) {
      console.error(error);
      setNotice("計算開始日を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const initializeCalendar = () => {
    if (busy) return;
    const dates = createDefaultCalendar(year, termSettings);
    setCalendar(dates);
    setCalendarDirty(true);
    setNotice("月〜土を各48回にした原案を作成しました。内容を確認してから保存してください。");
  };

  const saveCalendar = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setDoc(doc(db, "adminLessonCalendars", String(year)), {
        year,
        dates: calendar,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      });
      setCalendarDirty(false);
      setNotice("年間授業日を保存しました。");
      if (tab !== "calendar") await loadRecords(visibleStudents);
    } catch (error) {
      console.error(error);
      setNotice("年間授業日を保存できませんでした。管理者権限またはFirestoreルールを確認してください。");
    } finally {
      setBusy(false);
    }
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
    } catch (error) {
      console.error(error);
      setNotice("学期期間を保存できませんでした。管理者権限またはFirestoreルールを確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const toggleCalendarDate = async (id) => {
    if (busy) return;
    const next = { ...calendar, [id]: !calendar[id] };
    if (!next[id]) delete next[id];
    setCalendar(next);
    setCalendarDirty(true);
    setNotice(`${id}を${next[id] ? "授業日" : "休校日"}に変更しました。確定するには保存してください。`);
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
      if (isMiddleSchool(selectedStudent)) {
        const targetTermId = termIdForDate(recordDate, termSettings, year);
        if (targetTermId) {
          batch.set(
            doc(db, "users", selectedStudent.id, "lessonTerms", targetTermId, "records", recordDate),
            {
              date: recordDate,
              termId: targetTermId,
              attendance: status,
              originalLessonDate: status === "makeup" ? originalDate : null,
              behaviorNote: note.trim(),
              updatedBy: auth.currentUser?.uid || null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
      await batch.commit();
      await loadRecords();
      setNotice(status === "makeup" ? "欠席と振替をセットで保存しました。" : "出欠を保存しました。");
      setNote("");
    } finally {
      setBusy(false);
    }
  };

  const deleteAttendance = async (record) => {
    if (!selectedStudent || !record?.date) return setNotice("削除する記録を選択してください。");
    const relatedDate = record.status === "makeup" ? record.originalDate : record.makeupDate;
    const confirmMessage = relatedDate
      ? `${record.date}の記録を削除します。関連する${relatedDate}の振替情報も整理します。よろしいですか？`
      : `${record.date}の記録を削除します。よろしいですか？`;
    if (!window.confirm(confirmMessage)) return;

    setBusy(true);
    try {
      const batch = writeBatch(db);
      const attendanceRecordRef = (date) =>
        doc(db, "adminLessonAttendance", selectedKey, "records", date);
      const termRecordRef = (date) => {
        const termId = termIdForDate(date, termSettings, year);
        return termId ? doc(db, "users", selectedStudent.id, "lessonTerms", termId, "records", date) : null;
      };
      const deleteRecordAt = (date) => {
        batch.delete(attendanceRecordRef(date));
        if (isMiddleSchool(selectedStudent)) {
          const ref = termRecordRef(date);
          if (ref) batch.delete(ref);
        }
      };
      const clearMakeupLinkAt = (date) => {
        batch.set(
          attendanceRecordRef(date),
          {
            makeupDate: deleteField(),
            makeupCompleted: deleteField(),
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid || null,
          },
          { merge: true }
        );
        if (isMiddleSchool(selectedStudent)) {
          const ref = termRecordRef(date);
          if (ref) {
            batch.set(
              ref,
              {
                makeupDate: deleteField(),
                makeupCompleted: deleteField(),
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || null,
              },
              { merge: true }
            );
          }
        }
      };

      deleteRecordAt(record.date);
      if (record.status === "makeup" && record.originalDate) {
        clearMakeupLinkAt(record.originalDate);
      }
      if (record.status === "absent" && record.makeupDate) {
        deleteRecordAt(record.makeupDate);
      }

      await batch.commit();
      await loadStudentRecords(selectedKey);
      await loadRecords(visibleStudents);
      setNotice("出欠記録を削除しました。");
    } catch (error) {
      console.error(error);
      setNotice("出欠記録を削除できませんでした。管理者権限または通信状態を確認してください。");
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
            <article><span>学期別 差分</span><strong>{summaries.reduce((sum, item) => sum + item.terms.reduce((termSum, term) => termSum + Math.max(term.balance, 0), 0), 0)}</strong></article>
          </div>
          <div className="attendance-table-wrap">
            <table>
              <thead><tr><th>生徒</th><th>通塾曜日</th><th>学期別（現在週）予定 / 実施</th><th>欠席</th><th>振替</th><th>状態</th><th>学期別（トータル）予定 / 実施</th></tr></thead>
              <tbody>{summaries.map((item) => (
                <tr key={item.key} onClick={() => { setSelectedKey(item.key); setTab("record"); }}>
                  <td><strong>{item.student.name || item.student.realName || item.student.displayName}</strong><small>{gradeLabel(item.student.grade)}</small></td>
                  <td>{(item.student.lessonSchedule?.weekdays || item.student.weekdays || []).map((day) => WEEKDAYS[day]).join("・") || "未設定"}</td>
                  <td>
                    <div className="term-counts now">
                      {item.terms.map((term) => (
                        <span key={term.term} className={term.balance > 0 ? "needs-check" : ""}>
                          {term.term}学期 <strong>{term.planned}/{term.actual}</strong>
                          {term.balance > 0 && <small>差{term.balance}</small>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td><strong className="attendance-number">{item.absent}</strong></td>
                  <td>
                    <div className="makeup-status compact">
                      <strong>{item.makeup}</strong>
                      {item.pending > 0 && <small>未{item.pending}</small>}
                    </div>
                  </td>
                  <td><span className={item.pending ? "status-pending" : item.terms.some((term) => term.balance > 0) || item.missing ? "status-warning" : "status-ok"}>{item.pending ? `振替待ち ${item.pending}件` : item.terms.some((term) => term.balance > 0) ? "学期差分あり" : item.missing ? `${item.missing}件 要確認` : "正常"}</span></td>
                  <td>
                    <div className="term-counts total">
                      {item.terms.map((term) => (
                        <span key={term.term}>
                          {term.term}学期 <strong>{term.totalPlanned}/{term.totalActual}</strong>
                        </span>
                      ))}
                    </div>
                  </td>
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
            {visibleStudents.length === 0 && <p className="record-students-note">対象生徒がいません。</p>}
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
              <div className="recent-records">
                <h3>記録履歴 <small>{selectedRecordList.length}件</small></h3>
                <div className="record-history-list">
                  {selectedRecordList.map((record) => (
                    <div key={record.date}>
                      <time>{record.date}</time>
                      <strong>{record.status === "present" ? "実施" : record.status === "absent" ? "欠席" : "振替実施"}</strong>
                      <span>{record.makeupDate ? `振替済 ${record.makeupDate}` : record.status === "makeup" && record.originalDate ? `振替元 ${record.originalDate}` : record.status === "absent" ? "振替待ち" : record.note}</span>
                      <button type="button" className="record-delete" disabled={busy} onClick={() => deleteAttendance(record)}>削除</button>
                    </div>
                  ))}
                  {selectedRecordList.length === 0 && <p className="record-history-empty">まだ記録がありません。</p>}
                </div>
              </div>
            </>}
          </div>
        </section>
      )}

      {tab === "students" && (
        <section className="attendance-section">
          <div className="schedule-heading">
            <div><h2>通塾曜日を設定</h2><p>小学生と、既存アカウントを持つ中学生・高校生が自動で表示されます。</p></div>
            <button onClick={() => router.push("/admin/elementary-students")}>小学生の登録・編集</button>
          </div>
          <div className="schedule-list">{visibleStudents.map((student) => {
            const current = student.lessonSchedule?.weekdays || student.weekdays || [];
            return <article key={studentKey(student)}>
              <div>
                <strong>{student.name || student.realName || student.displayName}</strong>
                <span>{gradeLabel(student.grade)}・{student.source === "elementary" ? "管理者登録" : "生徒アカウント"}</span>
              </div>
              <div className="weekday-picker">{TEACHING_DAYS.map((day) => <button key={day} className={current.includes(day) ? "active" : ""} disabled={busy} onClick={() => saveSchedule(student, current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort())}>{WEEKDAYS[day]}</button>)}</div>
              <label className="lesson-start-field">
                計算開始日
                <input
                  type="date"
                  defaultValue={getLessonStartDate(student)}
                  disabled={busy}
                  onBlur={(event) => saveLessonStartDate(student, event.target.value)}
                />
              </label>
            </article>;
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
          <div className="calendar-toolbar">
            <div>
              <h2>{year}年度 年間授業カレンダー</h2>
              <p>3月〜翌3月を一画面で表示します。色が付いた日が授業日です。{calendarDirty ? " 未保存の変更があります。" : ""}</p>
            </div>
            <div className="calendar-actions">
              <button disabled={busy} onClick={initializeCalendar}>月〜土 各48回の原案を作成</button>
              <button className="primary-action" disabled={busy || !calendarDirty} onClick={saveCalendar}>{busy ? "保存中…" : "年間授業日を保存"}</button>
            </div>
          </div>
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
