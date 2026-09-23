"use client";
import { useAcademicContext } from '@/lib/useAcademicContext';

import { useEffect, useMemo, useState, useRef } from "react";
import { validateTerms, validateOtherYears } from '@/lib/calendarSettings.mjs';
import { useRouter } from "next/navigation";
import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
  endAt,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import "./lesson-attendance.css";
import "./attendance-adjustments.css";
import "./annual-calendar.css";
import "./edit-record.css";
import { availableStudentGrades } from "@/lib/studentFilterOptions.mjs";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const TEACHING_DAYS = [1, 2, 3, 4, 5, 6];
const attendanceRecordCache=new Map();
const RECORD_CACHE_MS=5*60*1000;
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
const isHighSchool = (student) => {
  const grade = Number(student.grade);
  return student.source === "user" && grade >= 10 && grade <= 12;
};
const gradeLabel = (grade) =>
  grade <= 6 ? `小${grade}` : ({ 7: "中1", 8: "中2", 9: "中3", 10: "高1", 11: "高2", 12: "高3" }[grade] || "対象外");
const getLessonStartDate = (student) =>
  student.lessonSchedule?.startDate ||
  student.lessonStartDate ||
  student.enrollmentDate ||
  student.joinedAt ||
  "";

const getDocsInDateRange = (segments, start, end) => getDocs(query(
  collection(db, ...segments), orderBy(documentId()), startAt(start), endAt(end)
));

const defaultTerms = (year) =>
    ({
        1: { start: "", end: "" },
        2: { start: "", end: "" },
        3: { start: "", end: "" },
      });

function createDefaultCalendar(year, terms) {
  const candidates = Object.fromEntries(TEACHING_DAYS.map((day) => [day, []]));
  const dates = {};
  const first = terms?.[1]?.start || `${year}-04-01`;
  const last = terms?.[3]?.end || `${year + 1}-03-31`;
  const cursor = new Date(`${first}T00:00:00`);
  const end = new Date(`${last}T00:00:00`);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    const id = dateId(cursor);
    const inTerm = [1, 2, 3].some(term => id >= terms[term].start && id <= terms[term].end);
    if (inTerm && TEACHING_DAYS.includes(weekday)) candidates[weekday].push(id);
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

function normalizeStatus(value) {
  if (value === "欠席" || value === "absent") return "absent";
  if (value === "振替" || value === "振替実施" || value === "makeup") return "makeup";
  if (value === '出席' || value === 'present') return 'present';
  return null;
}

function normalizeDateValue(value) {
  if (!value) return "";
  if (typeof value?.toDate === "function") return dateId(value.toDate());
  const text = String(value).trim().replace(/\//g, "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return text;
  return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
}

function normalizeAttendanceRecord(record, docId = "", fallback = {}) {
  const date = normalizeDateValue(record.date) || normalizeDateValue(docId);
  return {
    ...record,
    date,
    status: normalizeStatus(record.status || record.attendance),
    originalDate: normalizeDateValue(record.originalLessonDate || record.originalDate) || null,
    makeupDate: normalizeDateValue(record.makeupDate) || null,
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
  const timestamp = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    return new Date(value).getTime() || 0;
  };
  const sourcePriority = { classAttendance: 1, "lesson-records": 2, adminLessonAttendance: 3 };
  const currentTime = timestamp(current.updatedAt || current.recordedAt || current.createdAt);
  const recordTime = timestamp(record.updatedAt || record.recordedAt || record.createdAt);
  const recordIsNewer = recordTime > currentTime ||
    (recordTime === currentTime && (sourcePriority[record.source] || 0) >= (sourcePriority[current.source] || 0));
  const primary = recordIsNewer ? record : current;
  const secondary = recordIsNewer ? current : record;
  records[record.date] = {
    ...secondary,
    ...primary,
    status: primary.status,
    originalDate: primary.originalDate || null,
    makeupDate: primary.makeupDate || null,
    makeupCompleted: Boolean(primary.makeupCompleted),
    note: primary.note || "",
  };
  return records;
}

function isMakeupResolved(absence, records) {
  if (absence.makeupDate || absence.makeupCompleted) return true;
  return Object.values(records).some(
    (record) => record.status === "makeup" && record.originalDate === absence.date
  );
}

function linkMakeupRecords(records) {
  const linked = Object.fromEntries(Object.entries(records).filter(([, record]) => record.status));
  Object.values(linked).forEach((record) => {
    if (record.status !== "makeup" || !record.originalDate || linked[record.originalDate]?.status !== 'absent') return;
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

export default function LessonAttendanceManager({ recordsOnly = false, settingsOnly = false, onDirtyChange = () => {}, onBusyChange = () => {} }) {
  const academic = useAcademicContext();
  const router = useRouter();
  const now = new Date();
  const initialAcademicYear = now.getMonth() + 1 <= 3 ? now.getFullYear() - 1 : now.getFullYear();
  const [year, setYear] = useState(initialAcademicYear);
  const [newYear, setNewYear] = useState('');
  const [addedYears, setAddedYears] = useState([]);
  const [loadedYear, setLoadedYear] = useState(null);
  const [termsDirty, setTermsDirty] = useState(false);
  const yearChosen = useRef(false);
  const loadVersion = useRef(0);
  useEffect(() => {
    if (academic.current && !yearChosen.current) setYear(academic.current.year);
  }, [academic.current]);
  useEffect(() => {
    getDocs(collection(db, 'adminLessonCalendars')).then(snapshot => {
      setAddedYears(current => [...new Set([...current, ...snapshot.docs.filter(item => /^\d{4}$/.test(item.id)).map(item => Number(item.id))])]);
    }).catch(() => setNotice('保存済み年度の一覧を取得できませんでした。再読み込みしてください。'));
  }, []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState(settingsOnly ? 'settings' : 'overview');
  const [students, setStudents] = useState([]);
  const gradeFilters = useMemo(() => [["all", "全学年"], ...availableStudentGrades(students).map((value) => [String(value), gradeLabel(value)])], [students]);
  const [calendar, setCalendar] = useState({});
  const [termSettings, setTermSettings] = useState(defaultTerms(initialAcademicYear));
  const [records, setRecords] = useState({});
  const [selectedKey, setSelectedKey] = useState("");
  const [recordDate, setRecordDate] = useState(todayId());
  const [status, setStatus] = useState("present");
  const [originalDate, setOriginalDate] = useState("");
  const [note, setNote] = useState("");
  const [editingDate, setEditingDate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  const [notice, setNotice] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [calendarDirty, setCalendarDirty] = useState(false);
  const [scheduleDrafts, setScheduleDrafts] = useState({});
  const [scheduleSlotDrafts, setScheduleSlotDrafts] = useState({});

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
      .filter((item) => item.active !== false && item.enrollmentStatus !== "withdrawn" && Number(item.grade) >= 7 && Number(item.grade) <= 12);
    const elementary = elementarySnap.docs
      .map((item) => ({
        id: item.id,
        source: "elementary",
        ...item.data(),
      }))
      .filter((item) => item.active !== false && item.enrollmentStatus !== "withdrawn" && Number(item.grade) >= 1 && Number(item.grade) <= 6);
    setStudents([...elementary, ...secondary].sort((a, b) =>
      Number(a.grade || 0) - Number(b.grade || 0) ||
      String(a.realName || a.name || "").localeCompare(String(b.realName || b.name || ""), "ja")
    ));
  };

  const loadCalendar = async () => {
    const version = ++loadVersion.current;
    setLoadedYear(null);
    const [calendarSnapshot, termSnapshot] = await Promise.all([
      getDoc(doc(db, "adminLessonCalendars", String(year))),
      getDoc(doc(db, "adminTermSettings", String(year))),
    ]);
    if (version !== loadVersion.current) return;
    setCalendar(calendarSnapshot.exists() ? calendarSnapshot.data().dates || {} : {});
    setCalendarDirty(false);
    setTermSettings(termSnapshot.exists() ? termSnapshot.data().terms || defaultTerms(year) : defaultTerms(year));
    setTermsDirty(false);
    setLoadedYear(year);
  };

  const loadRecords = async (targetStudents = students) => {
    const monthStart = academicRecordStart;
    const monthEnd = academicRecordEnd;
    const entries = await Promise.all(
      targetStudents.map(async (student) => {
        const cacheKey=`${year}:${studentKey(student)}`,cached=attendanceRecordCache.get(cacheKey);
        if(cached&&Date.now()-cached.at<RECORD_CACHE_MS)return[studentKey(student),cached.records];
        if (isMiddleSchool(student)) {
          const [termSnapshots, directSnapshot] = await Promise.all([
            Promise.all(
              [1, 2, 3].map((term) =>
                getDocsInDateRange(["users",student.id,"lessonTerms",`${year}_${term}`,"records"],termSettings?.[term]?.start||monthStart,termSettings?.[term]?.end||monthEnd)
              )
            ),
            getDocsInDateRange(["adminLessonAttendance", studentKey(student), "records"], monthStart, monthEnd),
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
          const linked=linkMakeupRecords(mapped);attendanceRecordCache.set(cacheKey,{at:Date.now(),records:linked});return [studentKey(student), linked];
        }

        const [snapshot, classAttendanceSnapshot] = await Promise.all([
          getDocsInDateRange(["adminLessonAttendance", studentKey(student), "records"], monthStart, monthEnd),
          isHighSchool(student)
            ? getDocsInDateRange(["users", student.id, "classAttendance"], monthStart, monthEnd)
            : Promise.resolve({ docs: [] }),
        ]);
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
        classAttendanceSnapshot.docs.forEach((item) => {
          const data = item.data();
          if (!data.attended) return;
          const record = normalizeAttendanceRecord(
            { ...data, date: data.date || item.id, status: "present" },
            item.id,
            { studentId: student.id, studentSource: "user", source: "classAttendance" }
          );
          if (!record.date || record.date < monthStart || record.date > monthEnd) return;
          mergeAttendanceRecord(mapped, record);
        });
        const linked=linkMakeupRecords(mapped);attendanceRecordCache.set(cacheKey,{at:Date.now(),records:linked});return [studentKey(student), linked];
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
    const [snapshot, classAttendanceSnapshot] = await Promise.all([
      getDocs(collection(db, "adminLessonAttendance", key, "records")),
      student && isHighSchool(student)
        ? getDocs(collection(db, "users", student.id, "classAttendance"))
        : Promise.resolve({ docs: [] }),
    ]);
    const mapped = {};
    snapshot.docs.forEach((item) => {
      const record = normalizeAttendanceRecord(item.data(), item.id, {
        studentId: student?.id || null,
        studentSource: student?.source || null,
        source: "adminLessonAttendance",
      });
      if (record.date) mergeAttendanceRecord(mapped, record);
    });
    classAttendanceSnapshot.docs.forEach((item) => {
      const data = item.data();
      if (!data.attended) return;
      const record = normalizeAttendanceRecord(
        { ...data, date: data.date || item.id, status: "present" },
        item.id,
        { studentId: student.id, studentSource: "user", source: "classAttendance" }
      );
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
  const actualCutoff = todayId();
  const academicRecordStart = termSettings?.[1]?.start || `${year}-04-01`;
  const academicRecordEnd = termSettings?.[3]?.end || `${year + 1}-03-31`;
  const academicDueEnd =
    actualCutoff < academicRecordStart
      ? ""
      : actualCutoff <= academicRecordEnd
        ? actualCutoff
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
    if (!visibleStudents.length || tab === "settings" || tab === "students") return;
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
    const pending = absent.filter((record) => !isMakeupResolved(record, ownRecords)).length;
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
      const dueEnd = actualCutoff < start ? "" : actualCutoff <= end ? actualCutoff : end;
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
  }), [visibleStudents, records, calendar, monthDates, cutoff, selectedCalendarYear, month, termSettings, actualCutoff, academicRecordStart, academicDueEnd]);

  const selectedStudent = visibleStudents.find((student) => studentKey(student) === selectedKey);
  const selectedRecords = records[selectedKey] || {};
  const selectedRecordList = Object.values(selectedRecords)
    .filter((record) => record.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  const saveSchedule = async (student, weekdays, slots) => {
    setBusy(true);
    try {
      const target = student.source === "elementary"
        ? doc(db, "adminStudents", student.id)
        : doc(db, "users", student.id);
      const previous=(student.lessonSchedule?.weekdays||student.weekdays||[]).map(Number),history={effectiveFrom:todayId(),weekdays:weekdays.map(Number),previousWeekdays:previous,updatedBy:auth.currentUser?.uid||null};
      const normalizedSlots=Object.fromEntries(weekdays.map(day=>{const slot=slots?.[day]||{};return[String(day),{startTime:/^\d{2}:\d{2}$/.test(slot.startTime||'')?slot.startTime:'',subject:String(slot.subject||'').trim().slice(0,30)}]}));
      const normalizedTime=normalizedSlots[String(weekdays[0])]?.startTime||'';
      await updateDoc(target, student.source === "elementary"
        ? { weekdays, lessonStartTime:normalizedTime||null, lessonScheduleSlots:normalizedSlots, lessonScheduleHistory:arrayUnion({...history,startTime:normalizedTime,slots:normalizedSlots}), updatedAt: serverTimestamp() }
        : { 'lessonSchedule.weekdays':weekdays, 'lessonSchedule.startTime':normalizedTime||null, 'lessonSchedule.slots':normalizedSlots, 'lessonSchedule.history':arrayUnion({...history,startTime:normalizedTime,slots:normalizedSlots}), updatedAt: serverTimestamp() });
      await loadStudents();
      setScheduleDrafts((current) => { const next = { ...current }; delete next[studentKey(student)]; return next; });
      setScheduleSlotDrafts((current) => { const next = { ...current }; delete next[studentKey(student)]; return next; });
      setNotice("曜日ごとの通常授業時刻と教科を保存しました。");
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
    if (busy || loadedYear !== year) return;
    try { validateTerms(year, termSettings); } catch (error) { return setNotice(error.message); }
    if (Object.keys(calendar).length && !window.confirm('現在の授業日を原案で置き換えます。保存するまでは本番データは変わりません。続行しますか？')) return;
    const dates = createDefaultCalendar(year, termSettings);
    setCalendar(dates);
    setCalendarDirty(true);
    setNotice("学期期間内で月〜土を各48回まで設定した原案です。期間が短い曜日は48回未満になります。休業日を確認してから保存してください。");
  };

  const saveCalendar = async () => {
    if (busy || loadedYear !== year) return;
    if (termsDirty) return setNotice('先に学期期間を保存してください。');
    try { validateTerms(year, termSettings); } catch (error) { return setNotice(error.message); }
    setBusy(true);
    try {
      await setDoc(doc(db, "adminLessonCalendars", String(year)), {
        year,
        dates: calendar,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { mergeFields: ['year', 'dates', 'updatedAt', 'updatedBy'] });
      setCalendarDirty(false);
      setNotice("年間授業日を保存しました。");
      if (tab !== "settings") await loadRecords(visibleStudents);
    } catch (error) {
      console.error(error);
      setNotice("年間授業日を保存できませんでした。管理者権限またはFirestoreルールを確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const saveTermSettings = async () => {
    if (busy || loadedYear !== year) return;
    try { validateTerms(year, termSettings); } catch (error) { return setNotice(error.message); }
    const settings = [1, 2, 3].map((term) => termSettings[term]);
    if (settings.some((item) => !item?.start || !item?.end || item.start > item.end)) {
      return setNotice("各学期の開始日と終了日を確認してください。");
    }
    setBusy(true);
    try {
      const existing = await getDocs(collection(db, 'adminTermSettings'));
      validateOtherYears(year, termSettings, existing.docs.map(item => ({ year: Number(item.id), terms: item.data().terms })));
      await setDoc(doc(db, "adminTermSettings", String(year)), {
        academicYear: year,
        terms: termSettings,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });
      setTermsDirty(false);
      setNotice(`${year}年度の学期期間を保存しました。`);
    } catch (error) {
      console.error(error);
      setNotice(error.message || "学期期間を保存できませんでした。管理者権限またはFirestoreルールを確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const toggleCalendarDate = async (id) => {
    if (busy || loadedYear !== year) return;
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
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/admin/lesson-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "save", student: { id: selectedStudent.id, source: selectedStudent.source, grade: selectedStudent.grade }, date: recordDate, status, originalDate, note, year, terms: termSettings }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存に失敗しました。");
      attendanceRecordCache.delete(`${year}:${selectedKey}`);await loadRecords();
      onDirtyChange(false);
      setNotice(`${editingDate ? "出欠を修正" : "出欠を保存"}しました。${result.pointDelta ? ` 高校生のポイントを${result.pointDelta > 0 ? "+" : ""}${result.pointDelta}pt調整しました。` : ""}`);
      setNote("");
      setEditingDate("");
    } catch (error) {
      console.error(error);
      setNotice(error.message || "出欠記録を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const deleteAttendance = async (record) => {
    if (!selectedStudent || !record?.date) return setNotice("削除する記録を選択してください。");
    const relatedDate = record.status === "makeup" ? record.originalDate : record.makeupDate;
    const confirmMessage = relatedDate
      ? `${record.date}の出欠を取り消し、${relatedDate}との振替の紐づけを解除します。関連日の授業と宿題・単語テスト記録は残します。よろしいですか？`
      : `${record.date}の記録を削除します。よろしいですか？`;
    if (!window.confirm(confirmMessage)) return;

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/admin/lesson-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "delete", student: { id: selectedStudent.id, source: selectedStudent.source, grade: selectedStudent.grade }, date: record.date, year, terms: termSettings }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "削除に失敗しました。");
      await loadStudentRecords(selectedKey);
      attendanceRecordCache.delete(`${year}:${selectedKey}`);await loadRecords(visibleStudents);
      setNotice("出欠記録を削除しました。");
    } catch (error) {
      console.error(error);
      setNotice("出欠記録を削除できませんでした。管理者権限または通信状態を確認してください。");
    } finally {
      setBusy(false);
    }
  };

  const editAttendance = (record) => {
    setEditingDate(record.date);
    setRecordDate(record.date);
    setStatus(record.status);
    setOriginalDate(record.originalDate || "");
    setNote(record.note || "");
    setNotice(`${record.date}の記録を修正しています。`);
  };

  const cancelEdit = () => {
    setEditingDate("");
    setRecordDate(todayId());
    setStatus("present");
    setOriginalDate("");
    setNote("");
    setNotice("修正を取り消しました。");
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

  const changeYear = (nextYear) => {
    if (busy || !Number.isInteger(nextYear) || nextYear < 1900 || nextYear > 9998) return false;
    if (nextYear === year) return true;
    if ((calendarDirty || termsDirty) && !window.confirm('未保存の授業日・学期期間の変更を破棄して年度を切り替えますか？')) return false;
    yearChosen.current = true;
    loadVersion.current++;
    setLoadedYear(null);
    setCalendar({});
    setTermSettings(defaultTerms(nextYear));
    setCalendarDirty(false);
    setTermsDirty(false);
    setYear(nextYear);
    return true;
  };
  const addYear = () => {
    if (!/^\d{4}$/.test(newYear) || Number(newYear) < 1900 || Number(newYear) > 9998) return setNotice('年度は1900〜9998の4桁で入力してください。');
    const value = Number(newYear);
    if (!changeYear(value)) return;
    setAddedYears(current => [...new Set([...current, value])]);
    setNewYear('');
    setTab('settings');
    setNotice(`${value}年度を開きました。既存データがある場合は読み込みます。新規年度は学期期間を設定して保存してください。`);
  };

  return (
    <main className="attendance-admin">
      {academic.error && <p role="alert">{academic.error} {settingsOnly ? '学期期間を保存後、画面を再読み込みしてください。' : <a href="/admin/settings">管理者設定を確認</a>}</p>}
      <header className="attendance-hero">
        <div>
          <span>LESSON ATTENDANCE</span>
          <h1>{settingsOnly ? '教室・授業設定' : recordsOnly ? '出欠確認・振替管理' : '授業・欠席・振替管理'}</h1>
          <p>{settingsOnly ? '年度別の学期期間・年間授業日と、生徒ごとの通塾曜日・計算開始日を設定します。' : '予定授業数と実施記録を照合し、入力漏れと未消化の振替を見つけます。'}</p>
          {settingsOnly && <a href="/admin/lesson-records">学習記録・出欠管理へ戻る</a>}
        </div>
        <div className="attendance-period">
          <select disabled={busy} value={year} onChange={(event) => changeYear(Number(event.target.value))}>
            {[...new Set([initialAcademicYear - 1, initialAcademicYear, initialAcademicYear + 1, year, ...addedYears, ...academic.settings.map(item => item.year)])].sort((a, b) => a - b).map((value) =>
              <option key={value} value={value}>{value}年度</option>
            )}
          </select>
          {!settingsOnly && tab !== "settings" && <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) =>
              <option key={value} value={value}>{value}月</option>
            )}
          </select>}
        </div>
      </header>

      <nav className="attendance-tabs">
        {(settingsOnly ? [["settings", "学期・年間授業日"], ["students", "生徒の通塾曜日・開始日"]] : [["overview", "照合ダッシュボード"], ["record", "出欠の入力・履歴・修正"], ...(!recordsOnly ? [["students", "生徒・曜日設定"], ["settings", "授業設定"]] : [])]).map(([value, label]) =>
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>
        )}
      </nav>

      {notice && <p className="attendance-notice">{notice}</p>}

      {tab !== "settings" && (
        <div className="attendance-filter-bar" aria-label="学年フィルタ">
          {gradeFilters.map(([value, label]) => (
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
              <thead><tr><th>生徒</th><th>通塾曜日</th><th>学期別（今日まで）予定 / 実施</th><th>欠席</th><th>振替</th><th>状態</th><th>学期別（トータル）予定 / 実施</th></tr></thead>
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
              return <button key={key} className={selectedKey === key ? "active" : ""} onClick={() => { setSelectedKey(key); setEditingDate(""); setNote(""); setOriginalDate(""); }}>
                <strong>{student.name || student.realName || student.displayName}</strong><span>{gradeLabel(student.grade)}</span>
              </button>;
            })}
            {visibleStudents.length === 0 && <p className="record-students-note">対象生徒がいません。</p>}
          </aside>
          <div className="attendance-form" onChange={() => onDirtyChange(true)} onClick={event => { if (event.target.closest('.status-choices button')) onDirtyChange(true); }}>
            {!selectedStudent ? <div className="attendance-empty">左から生徒を選択してください。</div> : <>
              <div className="form-heading"><div><span>{editingDate ? "記録を修正中" : gradeLabel(selectedStudent.grade)}</span><h2>{selectedStudent.name || selectedStudent.realName}</h2></div><input type="date" value={recordDate} disabled={Boolean(editingDate)} onChange={(event) => setRecordDate(event.target.value)} /></div>
              <div className="status-choices">
                {[["present", "通常授業を実施"], ["absent", "欠席"], ["makeup", "振替を実施"]].map(([value, label]) =>
                  <button key={value} className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{label}</button>
                )}
              </div>
              {status === "makeup" && <label>振替元の欠席日<select value={originalDate} onChange={(event) => setOriginalDate(event.target.value)}><option value="">選択してください</option>{Object.values(selectedRecords).filter((record) => record.status === "absent" && (!record.makeupDate || record.makeupDate === editingDate)).map((record) => <option key={record.date} value={record.date}>{record.date}</option>)}</select></label>}
              <label>メモ（任意）<textarea value={note} onChange={(event) => setNote(event.target.value)} rows="3" /></label>
              <div className="record-form-actions"><button className="primary-action" disabled={busy} onClick={saveAttendance}>{busy ? "保存中…" : editingDate ? "修正内容を保存" : "記録を保存"}</button>{editingDate && <button type="button" className="record-cancel" disabled={busy} onClick={cancelEdit}>修正をやめる</button>}</div>
              <div className="recent-records">
                <h3>記録履歴 <small>{selectedRecordList.length}件</small></h3>
                <div className="record-history-list">
                  {selectedRecordList.map((record) => (
                    <div key={record.date}>
                      <time>{record.date}</time>
                      <strong>{record.status === "present" ? "実施" : record.status === "absent" ? "欠席" : "振替実施"}</strong>
                      <span>{record.makeupDate ? `振替済 ${record.makeupDate}` : record.status === "makeup" && record.originalDate ? `振替元 ${record.originalDate}` : record.status === "absent" ? "振替待ち" : record.note}</span>
                      <div className="record-row-actions"><button type="button" className="record-edit" disabled={busy} onClick={() => window.location.assign(`/admin/lesson-records?student=${encodeURIComponent(selectedKey)}&date=${record.date}`)}>登録内容と同じ項目を修正</button><button type="button" className="record-delete" disabled={busy} onClick={() => deleteAttendance(record)}>削除</button></div>
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
          <p>通塾曜日・計算開始日は生徒ごとの共通設定です。年度別の授業日は「学期・年間授業日」で設定します。</p>
          <div className="schedule-heading">
            <div><h2>通塾曜日を設定</h2><p>小学生と、既存アカウントを持つ中学生・高校生が自動で表示されます。</p></div>
            <button onClick={() => router.push("/admin/students")}>生徒管理を開く</button>
          </div>
          <div className="schedule-list">{visibleStudents.map((student) => {
            const current = student.lessonSchedule?.weekdays || student.weekdays || [];
            const key = studentKey(student);
            const draft = scheduleDrafts[key] || current;
            const currentTime=student.lessonSchedule?.startTime||student.lessonStartTime||'';
            const currentSlots=student.lessonSchedule?.slots||student.lessonScheduleSlots||Object.fromEntries(current.map(day=>[String(day),{startTime:currentTime,subject:''}]));
            const slotsDraft=scheduleSlotDrafts[key]||currentSlots;
            const changed = JSON.stringify(draft) !== JSON.stringify(current)||JSON.stringify(slotsDraft)!==JSON.stringify(currentSlots);
            return <article key={studentKey(student)}>
              <div>
                <strong>{student.name || student.realName || student.displayName}</strong>
                <span>{gradeLabel(student.grade)}・{student.source === "elementary" ? "管理者登録" : "生徒アカウント"}</span>
              </div>
              <div className="weekday-picker">{TEACHING_DAYS.map((day) => <button key={day} className={draft.includes(day) ? "active" : ""} disabled={busy} onClick={() => setScheduleDrafts((values) => ({ ...values, [key]: draft.includes(day) ? draft.filter((value) => value !== day) : [...draft, day].sort() }))}>{WEEKDAYS[day]}</button>)}</div>
              <div className="weekday-lesson-slots">{draft.map(day=>{const slot=slotsDraft[String(day)]||{startTime:'',subject:''};const patch=values=>setScheduleSlotDrafts(all=>({...all,[key]:{...slotsDraft,[String(day)]:{...slot,...values}}}));return <div key={day}><b>{WEEKDAYS[day]}曜</b><input aria-label={`${WEEKDAYS[day]}曜の開始時刻`} type="time" value={slot.startTime||''} onChange={event=>patch({startTime:event.target.value})}/><input aria-label={`${WEEKDAYS[day]}曜の教科`} placeholder="教科" value={slot.subject||''} onChange={event=>patch({subject:event.target.value})}/></div>})}</div>
              <button className="schedule-save" disabled={busy || !changed} onClick={() => saveSchedule(student, draft,slotsDraft)}>曜日・時刻・教科を保存</button>
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

      {tab === "settings" && (
        <section className="attendance-section">
          <div className="calendar-toolbar">
            <label>追加・確認する年度 <input aria-label="追加する年度" type="number" min="1900" max="9998" placeholder="例：2028" value={newYear} onChange={event => setNewYear(event.target.value)} /></label>
            <button disabled={busy} onClick={addYear}>年度を開く・追加</button>
            <p>年度を開くだけでは保存済みデータは変更されません。</p>
          </div>
          <div className="term-settings-panel">
            <div className="term-settings-heading">
              <div><h2>{year}年度 授業設定</h2><p>学期期間と年間授業日を続けて設定します。</p></div>
              <button disabled={busy || loadedYear !== year} onClick={saveTermSettings}>学期期間を保存</button>
            </div>
            <div className="term-settings-grid">
              {[1, 2, 3].map((term) => (
                <article key={term} className={`term-${term}`}>
                  <strong>{term}学期</strong>
                  <label>開始日<input disabled={busy || loadedYear !== year} type="date" value={termSettings?.[term]?.start || ""} onChange={(event) => { setTermsDirty(true); setTermSettings((current) => ({ ...current, [term]: { ...current[term], start: event.target.value } })); }} /></label>
                  <label>終了日<input disabled={busy || loadedYear !== year} type="date" value={termSettings?.[term]?.end || ""} onChange={(event) => { setTermsDirty(true); setTermSettings((current) => ({ ...current, [term]: { ...current[term], end: event.target.value } })); }} /></label>
                </article>
              ))}
            </div>
          </div>
          <div className="calendar-toolbar">
            <div>
              <h2>{year}年度 年間授業カレンダー</h2>
              <p>設定した1学期の開始月〜3学期の終了月を表示します。色が付いた日が授業日です。{calendarDirty || termsDirty ? " 未保存の変更があります。" : ""}</p>
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
