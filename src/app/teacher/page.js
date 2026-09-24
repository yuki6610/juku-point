"use client";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebaseConfig";
import { japanDateId } from "@/lib/academicCalendar.mjs";
import {
  aggregateItemResults,
  ITEM_RESULT_LABELS,
  reviewableHomeworkItems,
  validateAssignment,
} from "@/lib/homeworkModel.mjs";
import LessonReportFields from "@/components/LessonReportFields";
import HomeworkAssignmentRow from "@/components/HomeworkAssignmentRow";
import StaffScoreEntry from '@/components/StaffScoreEntry';
import ShiftPreferences from './ShiftPreferences';
import { availableStudentGrades } from "@/lib/studentFilterOptions.mjs";
import "./teacher.css";
import "./workflow-improvements.css";
import "./mobile-workflow.css";
import "./phase1-mobile-fixes.css";
import "./compact-picker.css";
import "./report-picker-redesign.css";

const getWeek = (value) => {
  const date = new Date(`${value}T12:00:00Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - start) / 86400000 + start.getUTCDay() + 1) / 7);
};
const gradeLabel = (value) =>
  Number(value) <= 6
    ? `小${Number(value)}`
    : Number(value) <= 9
      ? `中${Number(value) - 6}`
      : Number(value) <= 12
        ? `高${Number(value) - 9}`
        : "学年未設定";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const TEACHER_PERIODS = [
  { id: "period-3", label: "3講", start: "13:20" },
  { id: "period-4", label: "4講", start: "15:00" },
  { id: "period-5", label: "5講", start: "16:40" },
  { id: "period-6", label: "6講", start: "18:20" },
  { id: "period-7", label: "7講", start: "20:00" },
];
const periodForStudent = (item) => {
  const periodId = item.lessonPeriodId || "";
  const byId = TEACHER_PERIODS.find((period) => period.id === periodId || (period.id === "period-3" && periodId === "course-early"));
  if (byId) return byId.id;
  return TEACHER_PERIODS.find((period) => period.start === item.lessonStartTime)?.id || "unassigned";
};
const blankHomeworkItem = () => ({ subject:"all", materialId:"", range:"", note:"", customLabel:"", difficulty:3 });
const monthDay = value => /^\d{4}-(\d{2})-(\d{2})$/.test(value||'') ? `${Number(value.slice(5,7))}/${Number(value.slice(8,10))}` : value;
const submissionLabel = (status) =>
  status === "score"
    ? "提出（成績登録済み）"
    : status === "received" || status === "legacy"
      ? "提出"
      : status === "upcoming"
        ? "提出予定"
        : "未提出";
const plusDays = (value, days) => {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};
const nextLessonDate = (value, weekdays = []) => {
  const allowed = weekdays.map(Number);
  if (!allowed.length) return plusDays(value, 7);
  const next = new Date(`${value}T12:00:00`);
  for (let days = 1; days <= 7; days += 1) {
    next.setDate(next.getDate() + 1);
    if (allowed.includes(next.getDay())) return next.toISOString().slice(0, 10);
  }
  return plusDays(value, 7);
};
async function api(url, options) {
  const token = await auth.currentUser?.getIdToken(),
    config = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options?.headers || {}),
      },
    };
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1)
    try {
      response = await fetch(url, config);
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

export default function TeacherPage() {
  const embedded = false;
  const [date, setDate] = useState(japanDateId()),
    [context, setContext] = useState(null),
    [studentKey, setStudentKey] = useState(""),
    [homeworkData, setHomeworkData] = useState(null);
  const [gradeFilter, setGradeFilter] = useState("all"),
    [scheduledOnly, setScheduledOnly] = useState(true);
  const [reportPeriod, setReportPeriod] = useState("period-3");
  const [assignedKeys, setAssignedKeys] = useState([]),
    [assignmentOverrides, setAssignmentOverrides] = useState({ add: [], remove: [] }),
    [otherSelectedKeys, setOtherSelectedKeys] = useState([]),
    [selectionBusy, setSelectionBusy] = useState(false),
    [activeTab, setActiveTab] = useState("students");
  const [reviewId, setReviewId] = useState(""),
    [itemResults, setItemResults] = useState({}),
    [commentIds, setCommentIds] = useState([]),
    [late, setLate] = useState(false),
    [forgot, setForgot] = useState(false),
    [forgotItems,setForgotItems]=useState([]),
    [forgotOther,setForgotOther]=useState(""),
    [note, setNote] = useState(""),
    [nextLessonNote, setNextLessonNote] = useState("");
  const [wordCorrect, setWordCorrect] = useState(""),
    [wordTotal, setWordTotal] = useState(""),
    [wordRange, setWordRange] = useState(null),
    [nextWordRange, setNextWordRange] = useState(null),
    [wordRangeMode, setWordRangeMode] = useState("same");
  const [learningContent, setLearningContent] = useState(""),
    [reportFacts, setReportFacts] = useState({});
  const [attendance, setAttendance] = useState("present"),
    [originalDate, setOriginalDate] = useState("");
  const [lessonType, setLessonType] = useState('regular');
  const [nextItems, setNextItems] = useState([
      {
        subject: "all",
        materialId: "",
        range: "",
        customLabel: "",
        difficulty: 3,
      },
    ]),
    [dueDate, setDueDate] = useState(""),
    [notice, setNotice] = useState(""),
    [saveError, setSaveError] = useState(""),
    [saving, setSaving] = useState(false);
  const [nextLessonItems,setNextLessonItems]=useState([blankHomeworkItem()]);
  const [scoreStudentKey,setScoreStudentKey]=useState("");
  const [draftLoadedKey, setDraftLoadedKey] = useState("");
  const [homework, setHomework] = useState("none"),
    [assignmentId, setAssignmentId] = useState(""),
    [assignmentVersion, setAssignmentVersion] = useState(null),
    [reload, setReload] = useState(0),
    [dirty, setDirty] = useState(false);
  const student = context?.students.find((item) => item.key === studentKey);
  const filteredStudents = useMemo(
    () =>
      (context?.students || []).filter(
        (item) =>
          (!scheduledOnly || item.scheduled) &&
          (gradeFilter === "all" || String(item.grade) === gradeFilter),
      ),
    [context, scheduledOnly, gradeFilter],
  );
  const flushCurrentDraft = () => {
    if (!dirty || !studentKey || !draftLoadedKey) return;
    try {
      const payload = JSON.parse(localStorage.getItem(draftLoadedKey) || 'null');
      if (payload) api('/api/teacher/context', { method: 'POST', body: JSON.stringify({ date, studentKey, payload }) }).catch(() => {});
    } catch {}
  };
  const changeDate = (value) => {
    if (!value || value === date) return;
    flushCurrentDraft();
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        localStorage.removeItem(`teacher-assigned:${uid}:${date}`);
        localStorage.removeItem(`teacher-assigned:${uid}:${value}`);
      } catch {}
    }
    setAssignmentOverrides({ add: [], remove: [] });
    setAssignedKeys([]);
    setOtherSelectedKeys([]);
    setDate(value);
  };
  const changeStudent = (value) => {
    if (value === studentKey) return;
    flushCurrentDraft();
    setStudentKey(value);
    const nextStudent = context?.students.find(item => item.key === value);
    if (nextStudent) setReportPeriod(periodForStudent(nextStudent));
    if (value) setActiveTab("report");
  };
  const toggleAssigned = async (key) => {
    if (selectionBusy || otherSelectedKeys.includes(key) && !assignedKeys.includes(key)) return;
    const next = assignedKeys.includes(key) ? assignedKeys.filter(value => value !== key) : [...assignedKeys, key];
    const base = context?.suggestedKeys || [];
    setAssignedKeys(next);
    setAssignmentOverrides({ add: next.filter(value => !base.includes(value)), remove: base.filter(value => !next.includes(value)) });
    if (context?.role === 'admin') return;
    setSelectionBusy(true);
    try {
      const result = await api('/api/teacher/selections', { method: 'POST', body: JSON.stringify({ date, studentKeys: next }) });
      setOtherSelectedKeys(result.occupiedKeys || []);
    } catch (error) {
      setAssignedKeys(assignedKeys);
      setAssignmentOverrides({ add: assignedKeys.filter(value => !base.includes(value)), remove: base.filter(value => !assignedKeys.includes(value)) });
      setNotice(error.message);
      api(`/api/teacher/selections?date=${date}`).then(value => setOtherSelectedKeys(value.occupiedKeys || [])).catch(() => {});
    } finally {
      setSelectionBusy(false);
    }
  };
  const assignedStudents = (context?.students || []).filter((item) =>
    assignedKeys.includes(item.key),
  );
  const unassignedPeriodStudents = assignedStudents.filter((item) => periodForStudent(item) === "unassigned");
  const reportPeriodOptions = [
    ...TEACHER_PERIODS.filter(period => assignedStudents.some(item => periodForStudent(item) === period.id)),
    ...(unassignedPeriodStudents.length ? [{ id: "unassigned", label: "講数未設定" }] : []),
  ];
  const selectedReportPeriod = reportPeriodOptions.some(period => period.id === reportPeriod) ? reportPeriod : reportPeriodOptions[0]?.id || "";
  const reportPeriodStudents = assignedStudents.filter((item) => periodForStudent(item) === selectedReportPeriod);
  const selectedStudentPeriod = student ? TEACHER_PERIODS.find((period) => period.id === periodForStudent(student))?.label || "講数未設定" : "";
  const changePeriod = value => {
    if (value === selectedReportPeriod) return;
    flushCurrentDraft();
    setReportPeriod(value);
    if (studentKey && (!student || periodForStudent(student) !== value)) setStudentKey("");
  };
  const openTab = (value) => {
    if (value !== activeTab) flushCurrentDraft();
    setActiveTab(value);
    if (value !== "report") setStudentKey("");
  };
  useEffect(() => {
    let active = true;
    setContext(null);
    setStudentKey("");
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return location.replace("/teacher/login");
      try {
        const roleResponse=await fetch('/api/auth/role',{headers:{Authorization:`Bearer ${await user.getIdToken()}`}}),roleData=await roleResponse.json();
        if(!roleResponse.ok||!['teacher','admin'].includes(roleData.role)){
          const landing={parent:'/parent',student:'/mypage',admin:'/admin'}[roleData.role]||'/teacher/login';
          return location.replace(landing);
        }
      } catch { return location.replace('/teacher/login'); }
      Promise.all([
        api(`/api/teacher/context?date=${date}`),
        api(`/api/teacher/selections?date=${date}`),
      ])
          .then(([value, selections]) => {
            if (!active) return;
            setContext(value);
            let saved = {};
            try {
              saved = JSON.parse(
                localStorage.getItem(`teacher-assigned:${user.uid}:${date}`) || '{}',
              );
            } catch {}
            const base = value.suggestedKeys || [];
            const overrides = selections.hasSavedSelection
              ? { add: selections.mine.filter(key => !base.includes(key)), remove: base.filter(key => !selections.mine.includes(key)) }
              : Array.isArray(saved) ? { add: saved.filter(key => !base.includes(key)), remove: [] } : { add: Array.isArray(saved?.add) ? saved.add : [], remove: Array.isArray(saved?.remove) ? saved.remove : [] };
            const valid = new Set(value.students.map(item => item.key));
            const selected = [...new Set([...base.filter(key => !overrides.remove.includes(key)), ...overrides.add].filter(key => valid.has(key) && !selections.occupiedKeys.includes(key)))];
            setAssignmentOverrides({ add: selected.filter(key => !base.includes(key)), remove: base.filter(key => !selected.includes(key)) });
            setAssignedKeys(selected);
            setOtherSelectedKeys(selections.occupiedKeys || []);
            if (value.role !== 'admin' && !selections.hasSavedSelection && selected.length) {
              api('/api/teacher/selections', { method: 'POST', body: JSON.stringify({ date, studentKeys: selected }) }).catch(() => {});
            }
          })
          .catch((error) => {
            if (active) setNotice(error.message);
          });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [date]);
  useEffect(() => {
    if (activeTab !== 'students' || context?.role !== 'teacher') return undefined;
    const refresh = () => api(`/api/teacher/selections?date=${date}`)
      .then(value => setOtherSelectedKeys(value.occupiedKeys || []))
      .catch(() => {});
    const interval = window.setInterval(refresh, 15000);
    return () => window.clearInterval(interval);
  }, [activeTab, context?.role, date]);
  useEffect(() => {
    if (!auth.currentUser || context?.date !== date) return;
    try {
      localStorage.setItem(
        `teacher-assigned:${auth.currentUser.uid}:${date}`,
        JSON.stringify(assignmentOverrides),
      );
    } catch {}
  }, [assignmentOverrides, date, context?.date]);
  useEffect(() => {
    let active = true;
    setDraftLoadedKey("");
    setHomeworkData(null);
    setNotice("");
    setSaveError("");
    setDirty(false);
    if (!studentKey) return;
    const key = `teacher-draft:${auth.currentUser?.uid}:${date}:${studentKey}`;
    const apply = (value) => {
      setReviewId(value.reviewId ?? value.homeworkReview?.assignmentId ?? "");
      setItemResults(
        value.itemResults ?? value.homeworkReview?.itemResults ?? {},
      );
      setCommentIds(value.commentIds || []);
      setLate(value.late === true);
      setForgot(value.forgot === true);
      setForgotItems(value.forgotItems|| (value.forgot?['other']:[]));
      setForgotOther(value.forgotOther||"");
      setNote(value.note ?? value.behaviorNote ?? "");
      setNextLessonNote(value.nextLessonNote || "");
      setNextLessonItems(Array.isArray(value.nextLessonItems)&&value.nextLessonItems.length?value.nextLessonItems:[blankHomeworkItem()]);
      setWordCorrect(value.wordCorrect ?? value.wordTest?.correct ?? "");
      setWordTotal(Number(student?.grade) <= 6
        ? student?.wordTestQuestionCount ?? 20
        : value.wordTotal ?? value.wordTest?.total ?? student?.wordTestQuestionCount ?? 20);
      setWordRange(Number(student?.grade) <= 6 ? null :
        value.wordRange ??
          value.wordTest?.range ??
          student?.wordTestCurrentRange ??
          null,
      );
      setNextWordRange(Number(student?.grade) <= 6 ? null :
        value.nextWordRange ??
          value.wordTest?.nextRange ??
          value.wordRange ??
          value.wordTest?.range ??
          student?.wordTestCurrentRange ??
          null,
      );
      setWordRangeMode(value.wordRangeMode || "same");
      setLearningContent(value.learningContent || "");
      setReportFacts(value.reportFacts || {});
      setAttendance(value.attendance ?? value.status ?? (student?.lessonType === 'makeup' ? 'makeup' : 'present'));
      setOriginalDate(value.originalDate || value.originalLessonDate || (student?.lessonType === 'makeup' && /^\d{4}-\d{2}-\d{2}$/.test(student.lessonSourceId || '') ? student.lessonSourceId : ''));
      setLessonType(student?.lessonType || value.lessonType || 'regular');
      setNextItems(
        value.nextItems || [
          {
            subject: "all",
            materialId: "",
            range: "",
            customLabel: "",
            difficulty: 3,
          },
        ],
      );
      setDueDate(
        value.dueDate || nextLessonDate(date, student?.weekdays || []),
      );
      setHomework(value.homework || "none");
      setAssignmentId(value.nextId || crypto.randomUUID());
      setAssignmentVersion(value.nextVersion ?? null);
    };
    apply({});
    Promise.all([
      api(
        `/api/teacher/context?date=${date}&student=${encodeURIComponent(studentKey)}`,
      ),
      api(
        `/api/admin/homework?student=${encodeURIComponent(studentKey)}&date=${date}`,
      ),
    ])
      .then(async ([value, homeworkValue]) => {
        const reviewId = value.existingRecord?.homeworkReview?.assignmentId;
        if (
          reviewId &&
          !homeworkValue.items.some((item) => item.id === reviewId)
        ) {
          const selected = await api(
            `/api/admin/homework?student=${encodeURIComponent(studentKey)}&date=${date}&assignment=${encodeURIComponent(reviewId)}`,
          );
          homeworkValue.items.push(...selected.items);
        }
        if (!active) return;
        const assigned = homeworkValue.items.find(
          (item) => item.assignedDate === date,
        );
        const record = {
          ...value.existingRecord,
          ...(assigned
            ? {
                nextId: assigned.id,
                nextVersion: assigned.version,
                nextItems: assigned.items.map((item) => ({
                  subject:
                    item.subject ||
                    homeworkValue.templates.materials.find(
                      (material) => material.id === item.materialId,
                    )?.subject ||
                    "all",
                  materialId: item.materialId,
                  range: item.range,
                  note: item.note || "",
                  customLabel: item.customLabel || "",
                  difficulty: Number(item.difficulty || 3),
                })),
                dueDate: assigned.dueDate,
              }
            : {}),
        };
        let local;
        try {
          local = JSON.parse(localStorage.getItem(key) || "null");
        } catch {}
        apply(local || value.existingDraft || record);
        if(value.nextLessonNote?.text)setNotice(`次回授業メモ：${value.nextLessonNote.text}`);
        setDirty(Boolean(local || value.existingDraft));
        setHomeworkData(homeworkValue);
        setDraftLoadedKey(key);
        setNotice(
          local
            ? "自動保存した下書きを復元しました。"
            : value.existingDraft
              ? "共有下書きを復元しました。"
              : value.existingRecord
                ? "入力済みの記録です。訂正して保存できます。"
                : "",
        );
      })
      .catch((error) => {
        if (active) setNotice(error.message);
      });
    return () => {
      active = false;
    };
  }, [date, studentKey, reload]);
  useEffect(() => {
    if (
      !dirty ||
      !studentKey ||
      draftLoadedKey !==
        `teacher-draft:${auth.currentUser?.uid}:${date}:${studentKey}`
    )
      return;
    const payload = {
          reviewId,
          itemResults,
          commentIds,
          late,
          forgot,
          forgotItems,
          forgotOther,
          note,
          wordCorrect,
          wordTotal,
          ...(Number(student?.grade) > 6 ? { wordRange, nextWordRange, wordRangeMode } : {}),
          learningContent,
          reportFacts,
          attendance,
          lessonType,
          originalDate,
          nextItems,
          nextLessonItems,
          nextLessonNote,
          dueDate,
          homework,
          nextId: assignmentId,
          nextVersion: assignmentVersion,
        };
    try {
      localStorage.setItem(draftLoadedKey, JSON.stringify(payload));
    } catch {}

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await api("/api/teacher/context", {
          method: "POST",
          body: JSON.stringify({ date, studentKey, payload }),
        });
        if (!active) return;
        setContext((old) => ({
          ...old,
          draftStatus: {
            ...(old.draftStatus || {}),
            [studentKey]: { missingFields: result.missingFields || [] },
          },
        }));
        setNotice(
          result.missingFields?.length
            ? `自動保存しました。確認項目：${result.missingFields.join("、")}`
            : "自動保存しました。",
        );
      } catch (error) {
        if (active) setSaveError(`端末には保存済みですが、共有下書きの保存に失敗しました。${error.message}`);
      }
    }, 800);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [
    studentKey,
    date,
    draftLoadedKey,
    reviewId,
    itemResults,
    commentIds,
    late,
    forgot,
    forgotItems,
    forgotOther,
    note,
    nextLessonNote,
    wordCorrect,
    wordTotal,
    wordRange,
    nextWordRange,
    wordRangeMode,
    learningContent,
    reportFacts,
    originalDate,
    dueDate,
    nextItems,
    nextLessonItems,
    homework,
    assignmentId,
    assignmentVersion,
    attendance,
    lessonType,
    dirty,
  ]);
  const pending = useMemo(
    () =>
      (homeworkData?.items || []).filter(
        (item) =>
          item.assignedDate <= date &&
          (!item.review ||
            ["pending", "absent"].includes(item.review.status) ||
            item.review.date === date ||
            item.id === reviewId),
      ),
    [homeworkData, date, reviewId],
  );
  const reviewAssignment = pending.find((item) => item.id === reviewId);
  const isMiddle = student?.grade >= 7 && student?.grade <= 9,
    isElementary = student?.grade >= 1 && student?.grade <= 6;
  const elementaryEnglish=isElementary&&(String(student?.lessonSubject||'').toLowerCase().includes('english')||String(student?.lessonSubject||'').includes('英語')||nextItems.some(item=>item.subject==='english'));
  const wordEnabled=isMiddle||elementaryEnglish;
  const materials = (homeworkData?.templates?.materials || []).filter(
    (item) =>
      !item.audience ||
      item.audience === "all" ||
      item.audience === (isElementary ? "elementary" : "middle"),
  );
  const save = async () => {
    if (!student || saving || !draftLoadedKey || !homeworkData) return;
    const showSaveError = (message) => { setSaveError(message); setNotice(message); };
    if (lessonType === 'course' && !context?.coursePeriod) return showSaveError('講習期間外には講習授業を登録できません。');
    if (student.lessonType && lessonType !== student.lessonType) return showSaveError('確定シフトの授業種別と異なります。画面を読み直してください。');
    if (!attendance)
      return showSaveError("出席・欠席・振替出席のいずれかを選択してください。");
    setSaving(true);
    setSaveError("");
    setNotice("");
    let lessonSaved = false;
    try {
      const termId = context.term.id,
        weekId = `${context.term.year}-W${String(getWeek(date)).padStart(2, "0")}`;
      const reviewStatus = reviewAssignment
        ? aggregateItemResults(reviewAssignment.items, itemResults)
        : "pending";
      if (
        attendance !== "absent" &&
        reviewAssignment &&
        reviewStatus === "pending"
      )
        throw new Error("各宿題を「提出・途中・未提出」から選択してください。");
      let validItems =
        student.grade >= 10
          ? []
          : nextItems.filter((item) => item.materialId || item.range.trim());
      const automaticWordRange=nextWordRange||wordRange||student.wordTestCurrentRange||{start:1,end:Number(wordTotal||20)};
      if(isMiddle&&wordEnabled&&attendance!=="absent"&&wordCorrect!==""&&!validItems.some(item=>item.materialId==='words'))validItems=[...validItems,{subject:'english',materialId:'words',range:`${automaticWordRange.start}-${automaticWordRange.end}`,note:'次回単語テスト予定',difficulty:2}];
      const oldAssignment = homeworkData.items.find(
        (item) => item.id === assignmentId,
      );
      const signature = (items) =>
        JSON.stringify(
          items.map((item) => [
            item.subject,
            item.materialId,
            item.customLabel || "",
            item.range,
            item.note || "",
            Number(item.difficulty || 3),
          ]),
        );
      const unchanged =
        oldAssignment &&
        oldAssignment.dueDate === dueDate &&
        signature(oldAssignment.items) === signature(validItems);
      if (validItems.length && !unchanged)
        validateAssignment(
          { assignedDate: date, dueDate, items: validItems },
          homeworkData.templates,
        );
      if (oldAssignment && !validItems.length)
        throw new Error(
          "登録済み宿題は空欄で削除できません。管理者に確認してください。",
        );
      if (
        oldAssignment?.review &&
        !["pending", "absent"].includes(oldAssignment.review.status) &&
        !unchanged
      )
        throw new Error("確認済みの宿題内容は変更できません。");
      const homeworkReview = reviewId
        ? { assignmentId: reviewId, status: reviewStatus, itemResults }
        : null;
      if (
        wordEnabled &&
        attendance !== "absent" &&
        wordCorrect !== "" &&
        (!Number.isInteger(Number(wordCorrect)) ||
          Number(wordCorrect) < 0 ||
          !Number.isInteger(Number(wordTotal)) ||
          Number(wordTotal) < 1 ||
          Number(wordCorrect) > Number(wordTotal))
      )
        throw new Error("単語テストの正答数と問題数を確認してください。");
      const rawHandoffItems=nextLessonItems.filter(item=>item.materialId||String(item.range||'').trim()||String(item.customLabel||'').trim());
      const normalizedHandoffItems=rawHandoffItems.length
        ? validateAssignment({assignedDate:date,dueDate:date,items:rawHandoffItems},homeworkData.templates).items
        : [];
      const nextLessonHandoff=normalizedHandoffItems.length
        ? normalizedHandoffItems.map(item=>`${item.materialLabel}${item.range?` ${item.range}`:''}${item.note?`（${item.note}）`:''}`).join('／')
        : nextLessonNote;
      const learningRecord = {
        lessonType,
        homework:
          attendance === "absent"
            ? "notEvaluated"
            : reviewId
              ? reviewStatus === "submitted"
                ? "submitted"
                : reviewStatus
              : homework,
        wordTest: wordEnabled
          ? attendance === "absent"
            ? { status: "pending" }
            : wordCorrect !== ""
              ? {
                  status: "completed",
                  correct: wordCorrect,
                  total: wordTotal,
                  ...(isMiddle && wordRange ? { range: wordRange } : {}),
                  ...(isMiddle && nextWordRange ? { nextRange: nextWordRange, nextRangeMode: wordRangeMode } : {}),
                }
              : { status: "notScheduled" }
          : { status: "notScheduled", correct: null, total: null },
        late: student.grade < 10 && attendance !== "absent" && late,
        forgot: student.grade < 10 && attendance !== "absent" && forgot,
        forgotItems:student.grade<10&&attendance!=="absent"?forgotItems:[],
        forgotOther:forgotItems.includes('other')?forgotOther:'',
        behaviorNote: note,
        learningContent,
        reportFacts,
        nextLessonNote:nextLessonHandoff,
        nextLessonItems:normalizedHandoffItems,
      };
      if (attendance === "makeup" && !originalDate)
        throw new Error("振替元の授業日を入力してください。");
      if (student.grade >= 7 && student.grade <= 9)
        await api("/api/admin/lesson-records", {
          method: "POST",
          body: JSON.stringify({
            uid: student.source === 'elementary' ? `elementary_${student.id}` : student.id,
            date,
            termId,
            weekId,
            homeworkReview,
            commentIds,
            record: {
              ...learningRecord,
              nextLessonNote:nextLessonHandoff,
              nextLessonItems:normalizedHandoffItems,
              attendance,
              originalLessonDate: originalDate,
            },
          }),
        });
      else
        await api("/api/admin/lesson-attendance", {
          method: "POST",
          body: JSON.stringify({
            action: "save",
            student: {
              id: student.id,
              source: student.source,
              grade: student.grade,
            },
            date,
            status: attendance,
            lessonType,
            originalDate,
            nextLessonNote:nextLessonHandoff,
            nextLessonItems:normalizedHandoffItems,
            ...(isElementary
              ? { note, learningRecord, homeworkReview, commentIds }
              : {}),
          }),
        });
      lessonSaved = true;
      if (validItems.length && !unchanged) {
        if (!dueDate)
          throw new Error("新しい宿題の確認予定日を入力してください。");
        await api("/api/admin/homework", {
          method: "POST",
          body: JSON.stringify({
            id: assignmentId,
            version: assignmentVersion,
            student: student.key,
            assignedDate: date,
            dueDate,
            items: validItems,
          }),
        });
      }
      try {
        localStorage.removeItem(draftLoadedKey);
      } catch {}
      setDraftLoadedKey("");
      setDirty(false);
      setNotice("授業記録を管理者に送信しました。");
      setSaveError("");
      setContext((old) => ({
        ...old,
        inputStatus: {
          ...(old.inputStatus || {}),
          [student.key]: {
            updatedAt: new Date().toISOString(),
            updatedBy: auth.currentUser?.uid || null,
          },
        },
        draftStatus: { ...(old.draftStatus || {}), [student.key]: undefined },
      }));
      setReload((value) => value + 1);
    } catch (error) {
      showSaveError(`${lessonSaved ? "授業記録は保存済みですが、新しい宿題を保存できませんでした。 " : ""}${error.message}`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className={`teacher-shell ${embedded ? "teacher-embedded" : ""}`}>
      {saveError && <div className="teacher-save-error" role="alert"><span>{saveError}</span><button type="button" onClick={() => setSaveError("")} aria-label="エラー表示を閉じる">×</button></div>}
      <header>
        <div>
          <small>{embedded ? "ADMIN LESSON INPUT" : "TEACHER CONSOLE"}</small>
          <h1>{embedded ? "学習記録を入力" : "授業報告"}</h1>
          {embedded && <p>{context?.displayName || ""}</p>}
        </div>
      </header>
      <nav className={`teacher-work-tabs${activeTab === "report" ? " report-active" : ""}`}>
        <button
          className={activeTab === "students" ? "active" : ""}
          onClick={() => openTab("students")}
        >
          担当生徒を選択 <b>{assignedKeys.length}</b>
        </button>
        <button
          className={activeTab === "report" ? "active" : ""}
          disabled={!assignedKeys.length}
          onClick={() => openTab("report")}
        >
          授業報告
        </button>
        <button
          className={activeTab === "info" ? "active" : ""}
          disabled={!assignedKeys.length}
          onClick={() => openTab("info")}
        >
          生徒情報
        </button>
        <button className={activeTab === 'shift' ? 'active' : ''} onClick={() => openTab('shift')}>シフト希望</button>
      </nav>
      <fieldset
        className="teacher-edit-fields"
        disabled={saving}
        onChange={(event) => {
          if (!event.target.closest(".teacher-flow,.teacher-assignment-panel,.staff-score-entry,.teacher-shift-preferences"))
            setDirty(true);
        }}
        onClick={(event) => {
          if (
            event.target.closest("button") &&
            !event.target.closest(
              ".teacher-flow,.teacher-assignment-panel,.teacher-save,.staff-score-entry,.teacher-shift-preferences",
            )
          )
            setDirty(true);
        }}
      >
        {notice && (
          <p className="teacher-notice" role="status">
            {notice}
          </p>
        )}
        {activeTab === "students" && (
          <section className="teacher-assignment-panel">
            <label>
              授業日
              <input
                type="date"
                value={date}
                onChange={(e) => changeDate(e.target.value)}
              />
              <small>
                {context ? `${WEEKDAYS[context.weekday]}曜日の予定生徒` : ""}
              </small>
            </label>
            <div className="teacher-filters compact">
              <label>
                <input
                  type="checkbox"
                  checked={scheduledOnly}
                  onChange={(e) => setScheduledOnly(e.target.checked)}
                />
                予定生徒のみ
              </label>
              <select
                aria-label="学年で絞り込み"
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
              >
                <option value="all">全学年</option>
                {availableStudentGrades(context?.students || []).map((value) => (
                  <option key={value} value={value}>
                    {gradeLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            {assignedStudents.length > 0 && <div className="teacher-assigned-students"><span>選択中</span>{assignedStudents.map(item=><button type="button" key={item.key} disabled={selectionBusy} onClick={()=>toggleAssigned(item.key)}><strong>{item.name}</strong><small>選択を外す</small></button>)}</div>}
            <div className="teacher-assignment-list">
              {filteredStudents.filter(item=>!assignedKeys.includes(item.key)).map((item) => (
                <label
                  key={item.key}
                  className={otherSelectedKeys.includes(item.key) ? 'selected-by-other' : ''}
                >
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={selectionBusy || otherSelectedKeys.includes(item.key)}
                    onChange={() => toggleAssigned(item.key)}
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.lessonStartTime || "時刻未設定"}・
                      {gradeLabel(item.grade)}{item.lessonType === 'course' ? '・講習' : item.lessonType === 'makeup' ? '・振替' : ''}{otherSelectedKeys.includes(item.key) ? '・他の講師が選択中' : ''}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              className="teacher-next-step"
              disabled={!assignedKeys.length}
              onClick={() => openTab("report")}
            >
              選択した{assignedKeys.length}人の入力へ
            </button>
          </section>
        )}
        {activeTab === 'shift' && <ShiftPreferences />}
        {activeTab === "report" && (
          <section className="teacher-flow">
            <label>
              <span>授業日</span>
              <input
                type="date"
                value={date}
                onChange={(e) => changeDate(e.target.value)}
              />
            </label>
            <label className="teacher-period-select">
              <span>授業時間</span>
              <select value={selectedReportPeriod} onChange={(event) => changePeriod(event.target.value)} disabled={!reportPeriodOptions.length}>
                {!reportPeriodOptions.length && <option value="">担当生徒がいません</option>}
                {reportPeriodOptions.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
              </select>
            </label>
            {!!reportPeriodStudents.length && <div className="teacher-period-students"><span>この時間の担当生徒</span><div>{reportPeriodStudents.map(item => <button type="button" key={item.key} className={studentKey === item.key ? "selected" : ""} aria-pressed={studentKey === item.key} onClick={() => changeStudent(item.key)}><strong>{item.realName || item.name}</strong><small>{item.lessonStartTime ? `${item.lessonStartTime}開始` : gradeLabel(item.grade)}</small></button>)}</div></div>}
            {!assignedStudents.length && <p className="teacher-empty-students">「担当生徒を選択」から入力対象を選んでください。</p>}
            {assignedStudents.length > 0 && !reportPeriodStudents.length && <p className="teacher-empty-students">この授業時間に担当生徒はいません。</p>}
          </section>
        )}
        {activeTab === "info" && (
          <section className="teacher-student-info-list">
            <h2>担当生徒の情報</h2>
            {assignedStudents.map((item) => {
              const info = context?.guidanceByStudent?.[item.key] || {};
              return (
                <details key={item.key}>
                  <summary>
                    <strong>{item.name}</strong>
                    <small>
                      {item.lessonStartTime || "時刻未設定"}・
                      {gradeLabel(item.grade)}
                    </small>
                  </summary>
                  {info.sharedInfo && (
                    <p>
                      <b>共有事項</b>
                      {info.sharedInfo}
                    </p>
                  )}
                  {info.teacherMemo && (
                    <p>
                      <b>直近メモ</b>
                      {info.teacherMemo}
                    </p>
                  )}
                  {info.policy && (
                    <p>
                      <b>授業方針</b>
                      {info.policy}
                    </p>
                  )}
                  {info.materials && (
                    <p className="teacher-info-material">
                      <b>教材</b>
                      {info.materials}
                    </p>
                  )}
                  {info.courseMaterials && (
                    <p className="teacher-info-material course">
                      <b>講習教材</b>
                      {info.courseMaterials}
                    </p>
                  )}
                  {info.submissionStatus?.items?.some(entry=>entry.status==='missing') && (
                    <div className="teacher-submission-status">
                      <b>成績資料</b>
                      {info.submissionStatus.items.filter(entry=>entry.status==='missing').map((entry) => (
                        <span
                          key={entry.id}
                          className={
                            entry.status === "missing" ? "missing" : "received"
                          }
                        >
                          {entry.kind === "internal"
                            ? "通知表"
                            : entry.testType}
                          ：{submissionLabel(entry.status)}
                        </span>
                      ))}
                    </div>
                  )}
                  {Number(item.grade) >= 7 && Number(item.grade) <= 9 && <div className="teacher-info-score-action"><button type="button" onClick={()=>setScoreStudentKey(current=>current===item.key?'':item.key)}>{scoreStudentKey===item.key?'成績入力を閉じる':'この生徒の成績を入力'}</button>{scoreStudentKey===item.key&&<StaffScoreEntry studentKey={item.key} students={context?.students||[]}/>}</div>}
                  {!Object.values(info).some(Boolean) && (
                    <p>登録された共有情報はありません。</p>
                  )}
                </details>
              );
            })}
          </section>
        )}
        {activeTab === "report" && student && (
          <div className="teacher-selected-student teacher-selected-student-sticky">
            <strong>{student.realName || student.name}</strong>
            <small>
              {selectedStudentPeriod} · {student.lessonStartTime ? `${student.lessonStartTime}開始 · ` : ""}
              {gradeLabel(student.grade)} · {date}
            </small>
          </div>
        )}
        {activeTab === "report" && student && homeworkData && (
          <section className="teacher-attendance-section teacher-input-section teacher-check-section">
            <h2>出席状況</h2>
            <div className="teacher-attendance">
              {[
                ["present", "出席"],
                ["absent", "欠席"],
                ["makeup", "振替出席"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={attendance === value ? "selected" : ""}
                  onClick={() => { setAttendance(value); if (!student.lessonType) setLessonType(value === 'makeup' ? 'makeup' : 'regular'); }}
                >
                  {label}
                </button>
              ))}
            </div>
            {attendance === "makeup" && (
              <label>
                振替元の欠席授業
                <select
                  value={originalDate}
                  onChange={(e) => setOriginalDate(e.target.value)}
                >
                  <option value="">欠席授業を選択</option>
                  {originalDate &&
                    !(context.absenceCandidates || []).some(
                      (item) => item.date === originalDate,
                    ) && (
                      <option value={originalDate}>
                        {originalDate}（登録済み）
                      </option>
                    )}
                  {(context.absenceCandidates || []).map((item) => (
                    <option key={item.date} value={item.date}>
                      {item.date}
                      {item.note ? `　${item.note}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        )}
        {student &&
          context?.guidance &&
          (context.guidance.policy ||
            context.guidance.materials ||
            context.guidance.courseMaterials ||
            context.guidance.teacherMemo ||
            context.guidance.sharedInfo ||
            context.guidance.submissionStatus?.items?.some(entry=>entry.status==='missing')) && (
            <details className="teacher-guidance">
              <summary>教室メモ・共有事項</summary>
              {context.guidance.sharedInfo && (
                <p>
                  <strong>共有事項</strong> {context.guidance.sharedInfo}
                </p>
              )}
              {context.guidance.teacherMemo && (
                <p>
                  <strong>直近メモ</strong> {context.guidance.teacherMemo}
                </p>
              )}
              {context.guidance.policy && (
                <p>
                  <strong>授業方針</strong> {context.guidance.policy}
                </p>
              )}
              {context.guidance.materials && (
                <p>
                  <strong>教材</strong> {context.guidance.materials}
                </p>
              )}
              {context.guidance.courseMaterials && (
                <p>
                  <strong>講習教材</strong> {context.guidance.courseMaterials}
                </p>
              )}
              {context.guidance.submissionStatus?.items?.some(entry=>entry.status==='missing') && (
                <div className="teacher-submission-status">
                  <b>成績資料</b>
                  {context.guidance.submissionStatus.items.filter(entry=>entry.status==='missing').map((entry) => (
                    <span
                      key={entry.id}
                      className={
                        entry.status === "missing" ? "missing" : "received"
                      }
                    >
                      {entry.kind === "internal" ? "通知表" : entry.testType}：
                      {submissionLabel(entry.status)}
                    </span>
                  ))}
                </div>
              )}
            </details>
          )}
        {student&&context?.nextLessonNote?.text&&<aside className="teacher-guidance"><strong>次回授業メモ</strong><p>{context.nextLessonNote.text}</p><small>表示後に引継ぎDBから自動消去されました。</small></aside>}
        {student&&context?.academicRecords&&<details className="teacher-guidance"><summary>成績・模試・高校判定</summary><div className="teacher-score-summary">{context.academicRecords.scores?.map(item=><article key={item.id}><b>{item.year} {item.term} {item.type==='internal'?'内申':item.testType||'テスト'}</b><span>{item.type==='internal'?`内申換算 ${item.internalTotal??'未登録'}`:`合計 ${item.examTotal??'未登録'}点`}</span></article>)}{context.academicRecords.mockScores?.map(item=><article key={item.id}><b>{item.examName}</b><span>偏差値 {item.overallDeviation??'未登録'}・判定 {item.judgement||'未登録'}</span></article>)}{context.academicRecords.judgments?.map(item=><article key={item.id}><b>{item.name}</b><span>{item.label}（基準差 {item.difference>=0?'+':''}{item.difference}）</span></article>)}{!context.academicRecords.scores?.length&&!context.academicRecords.mockScores?.length&&<p>登録済みの成績はありません。</p>}</div></details>}
        {student && homeworkData && student.grade < 10 && (
          <>
            <details key={`check-${studentKey}`} className="teacher-input-section teacher-check-section teacher-section-fold" open>
              <summary>今日の確認</summary>
              <div className="teacher-section-fold-body">
              {pending.length ? (
                <>
                  <label>
                    確認する宿題
                    <select
                      value={reviewId}
                      onChange={(e) => {
                        setReviewId(e.target.value);
                        const selected = pending.find(
                          (item) => item.id === e.target.value,
                        );
                        setItemResults(
                          selected?.review?.date === date
                            ? selected.review.itemResults || {}
                            : {},
                        );
                      }}
                    >
                      <option value="">宿題なし・今回は確認しない</option>
                      {pending.map((item) => (
                        <option key={item.id} value={item.id}>
                          {monthDay(item.dueDate)}予定：
                          {item.items
                            .map((row) => `${row.materialLabel} ${row.range}`)
                            .join("／")}
                        </option>
                      ))}
                    </select>
                  </label>
                  {attendance !== "absent" &&
                    reviewAssignment &&
                    reviewableHomeworkItems(reviewAssignment.items).map(
                      (item) => (
                        <div key={item.id}>
                          <strong>
                            {item.materialLabel} {item.range}
                          </strong>
                          <div className="teacher-checks">
                            {Object.entries(ITEM_RESULT_LABELS).map(
                              ([status, label]) => (
                                <label key={status}>
                                  <input
                                    type="radio"
                                    name={`homework-${item.id}`}
                                    checked={itemResults[item.id] === status}
                                    onChange={() =>
                                      setItemResults((old) => ({
                                        ...old,
                                        [item.id]: status,
                                      }))
                                    }
                                  />
                                  {label}
                                </label>
                              ),
                            )}
                          </div>
                        </div>
                      ),
                    )}
                </>
              ) : (
                <p>確認待ちの宿題はありません。</p>
              )}
              {!reviewId &&
                attendance !== "absent" &&
                homework !== "none" && (
                  <div className="manual-homework-wrap">
                    <div className="teacher-attendance manual-homework">
                      {Object.entries(ITEM_RESULT_LABELS).map(
                        ([value, label]) => (
                          <button
                            type="button"
                            key={value}
                            className={homework === value ? "selected" : ""}
                            onClick={() => setHomework(value)}
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </div>
                    <button
                      type="button"
                      className="homework-none-reset"
                      onClick={() => setHomework("none")}
                    >
                      今回は宿題なし
                    </button>
                  </div>
                )}
              {attendance === "absent" && (
                <p>欠席のため宿題の判定は保留にします。</p>
              )}
              {wordEnabled && (
                <details
                  className="teacher-word-details"
                  open={wordCorrect !== ""}
                >
                  <summary>単語テストを入力{!isElementary && student?.wordTestCurrentRange ? `（No.${student.wordTestCurrentRange.start}〜${student.wordTestCurrentRange.end}）` : ''}</summary>
                  <div className={`teacher-word ${isElementary ? "elementary" : ""}`}>
                    <label>
                      正答数
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={wordCorrect}
                        onChange={(e) => setWordCorrect(e.target.value)}
                      />
                    </label>
                    <span>/</span>
                    {isElementary ? <span>{wordTotal}点満点</span> : <label>
                      問題数
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={wordTotal}
                        onChange={(e) => setWordTotal(e.target.value)}
                      />
                    </label>}
                  </div>
                  {!isElementary && wordCorrect !== "" && (
                    <>
                      <div className="teacher-word-range-current">
                        <b>今回の出題範囲</b>
                        <div className="number-range">
                          <input aria-label="今回の開始番号" type="number" min="1" value={wordRange?.start || ""} onChange={(e)=>{const next={start:Number(e.target.value),end:Number(wordRange?.end||e.target.value)};setWordRange(next);if(wordRangeMode==='same')setNextWordRange(next)}}/>
                          <b>〜</b>
                          <input aria-label="今回の終了番号" type="number" min="1" value={wordRange?.end || ""} onChange={(e)=>{const next={start:Number(wordRange?.start||e.target.value),end:Number(e.target.value)};setWordRange(next);if(wordRangeMode==='same')setNextWordRange(next)}}/>
                        </div>
                      </div>
                      <label>
                        次回の出題範囲
                        <select
                          value={wordRangeMode}
                          onChange={(e) => {
                            const mode = e.target.value,
                              current = wordRange || student.wordTestCurrentRange || {
                                start: 1,
                                end: Number(
                                  wordTotal ||
                                    student.wordTestQuestionCount ||
                                    20,
                                ),
                              };
                            setWordRangeMode(mode);
                            if (mode !== "custom")
                              setNextWordRange(
                                mode === "next"
                                  ? {
                                      start: Number(current.end) + 1,
                                      end:
                                        Number(current.end) +
                                        Number(wordTotal || 20),
                                    }
                                  : current,
                              );
                          }}
                        >
                          <option value="same">今回と同じ：No.{wordRange?.start || student.wordTestCurrentRange?.start || 1}〜{wordRange?.end || student.wordTestCurrentRange?.end || wordTotal}</option>
                          <option value="next">次へ進む：No.{Number(wordRange?.end || student.wordTestCurrentRange?.end || 0)+1}〜{Number(wordRange?.end || student.wordTestCurrentRange?.end || 0)+Number(wordTotal || 20)}</option>
                          <option value="custom">手入力・修正</option>
                        </select>
                      </label>
                      {wordRangeMode === "custom" && (
                        <div className="number-range">
                          <input
                            aria-label="開始番号"
                            type="number"
                            min="1"
                            value={nextWordRange?.start || ""}
                            onChange={(e) =>
                              setNextWordRange((old) => ({
                                start: Number(e.target.value),
                                end: Number(old?.end || e.target.value),
                              }))
                            }
                          />
                          <b>〜</b>
                          <input
                            aria-label="終了番号"
                            type="number"
                            min="1"
                            value={nextWordRange?.end || ""}
                            onChange={(e) =>
                              setNextWordRange((old) => ({
                                start: Number(old?.start || e.target.value),
                                end: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      )}
                    </>
                  )}
                </details>
              )}
              {student.grade<10 && (
                <div className="teacher-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={late}
                      onChange={(e) => setLate(e.target.checked)}
                    />
                    遅刻
                  </label>
                  <strong className="teacher-check-label">忘れ物</strong>
                  {[['workbook','ワーク'],['stationery','筆記用具'],['other','その他']].map(([id,label])=><label key={id}><input type="checkbox" checked={forgotItems.includes(id)} onChange={()=>{setForgotItems(old=>{const next=old.includes(id)?old.filter(value=>value!==id):[...old,id];setForgot(next.length>0);return next})}}/>{label}</label>)}
                  {forgotItems.includes('other')&&<input aria-label="その他の忘れ物" placeholder="その他の内容" value={forgotOther} onChange={event=>setForgotOther(event.target.value)}/>}
                </div>
              )}
              </div>
            </details>
            <section className="teacher-input-section teacher-homework-section">
              <h2>次回までの宿題</h2>
              <p className="teacher-help">
                教材、教科、範囲を入力してください。
              </p>
              <details className="teacher-assigned-homework" open={!nextItems.some((item) => item.materialId || item.range || item.customLabel)}>
                <summary>宿題を確認・編集（{nextItems.filter((item) => item.materialId || item.range || item.customLabel).length}件）</summary>
                {nextItems.map((item, index) => (
                  <HomeworkAssignmentRow
                    key={index}
                    item={item}
                    materials={materials}
                    elementary={isElementary}
                    materialFirst
                    onChange={(value) =>
                      setNextItems((old) =>
                        old.map((row, i) => (i === index ? value : row)),
                      )
                    }
                    onRemove={() =>
                      setNextItems((old) => old.filter((_, i) => i !== index))
                    }
                    removeDisabled={nextItems.length === 1}
                  />
                ))}
              </details>
              <button
                onClick={() =>
                  setNextItems((old) => [
                    ...old,
                    {
                      subject: "all",
                      materialId: "",
                      range: "",
                      customLabel: "",
                      difficulty: 3,
                    },
                  ])
                }
              >
                ＋ 宿題を追加
              </button>
              <details>
                <summary>例外的に確認日を変更</summary>
                <label>
                  確認予定日
                  <input
                    type="date"
                    min={date}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
              </details>
            </section>
          </>
        )}
        {student && homeworkData && student.grade < 10 && (
          <details key={`report-${studentKey}`} className="teacher-report-section teacher-section-fold">
            <summary>保護者への授業報告</summary>
            <div className="teacher-section-fold-body">
            <LessonReportFields
              learningContent={learningContent}
              onLearningContentChange={setLearningContent}
              value={reportFacts}
              onChange={setReportFacts}
              teacherView
              elementary={isElementary}
              context={{
                grade: gradeLabel(student?.grade),
                subject: student?.lessonSubject || "",
              }}
              studentKey={studentKey}
              lessonDate={date}
            />
            <div className="teacher-private-note">
              <strong>次回授業メモ</strong>
              <small>今回使った教材とページ・範囲を入力してください。次の通常授業で講師に一度だけ表示します。</small>
              {nextLessonItems.map((item,index)=><HomeworkAssignmentRow
                key={`next-lesson-${index}`}
                item={item}
                materials={materials}
                elementary={isElementary}
                materialFirst
                showDifficulty={false}
                rangeLabel="ページ・補足"
                rangePlaceholder="例：p.10-12／間違えた問題を解き直す"
                onChange={value=>setNextLessonItems(current=>current.map((entry,itemIndex)=>itemIndex===index?value:entry))}
                onRemove={()=>setNextLessonItems(current=>current.filter((_,itemIndex)=>itemIndex!==index))}
                removeDisabled={nextLessonItems.length===1}
              />)}
              <button type="button" onClick={()=>setNextLessonItems(current=>[...current,blankHomeworkItem()])}>＋教材を追加</button>
              {nextLessonNote&&!nextLessonItems.some(item=>item.materialId||item.range||item.customLabel)&&<small>以前のメモ：{nextLessonNote}</small>}
            </div>
            <label className="teacher-private-note">
              教室内メモ<small>管理者・講師だけが確認します</small>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="保護者には表示されません"
              />
            </label>
            </div>
          </details>
        )}
        {student && !homeworkData && (
          <p role="status">
            記録を読み込み中です。
            {notice && (
              <button onClick={() => setReload((value) => value + 1)}>
                再読み込み
              </button>
            )}
          </p>
        )}
        {activeTab === "report" && student && homeworkData && (
          <div className="teacher-final-save-action">
            <button
              className="teacher-save"
              disabled={
                saving ||
                draftLoadedKey !==
                  `teacher-draft:${auth.currentUser?.uid}:${date}:${studentKey}`
              }
              onClick={save}
            >
              {saving ? "送信中…" : "この授業記録を管理者に送信"}
            </button>
          </div>
        )}
      </fieldset>
    </main>
  );
}
