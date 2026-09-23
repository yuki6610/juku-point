"use client";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
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
import { availableStudentGrades } from "@/lib/studentFilterOptions.mjs";
import "./teacher.css";
import "./workflow-improvements.css";
import "./mobile-workflow.css";
import "./phase1-mobile-fixes.css";
import "./compact-picker.css";

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
  const [assignedKeys, setAssignedKeys] = useState([]),
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
    [saving, setSaving] = useState(false);
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
  const confirmMove = () =>
    !dirty ||
    window.confirm(
      "この生徒の入力は端末内に一時保存されています。別の入力へ移動しますか？",
    );
  const changeDate = (value) => {
    if (confirmMove()) setDate(value);
  };
  const changeStudent = (value) => {
    if (confirmMove()) {
      setStudentKey(value);
      if (value) setActiveTab("report");
    }
  };
  const toggleAssigned = (key) =>
    setAssignedKeys((old) =>
      old.includes(key) ? old.filter((value) => value !== key) : [...old, key],
    );
  const assignedStudents = (context?.students || []).filter((item) =>
    assignedKeys.includes(item.key),
  );
  const openTab = (value) => {
    if (!confirmMove()) return;
    setActiveTab(value);
    if (value !== "report") setStudentKey("");
  };
  useEffect(() => {
    let active = true;
    setContext(null);
    setStudentKey("");
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) location.href = "/teacher/login";
      else
        api(`/api/teacher/context?date=${date}`)
          .then((value) => {
            if (!active) return;
            setContext(value);
            let saved = [];
            try {
              saved = JSON.parse(
                localStorage.getItem(`teacher-assigned:${user.uid}:${date}`) ||
                  "[]",
              );
            } catch {}
            setAssignedKeys(
              saved.filter((key) =>
                value.students.some((item) => item.key === key),
              ),
            );
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
    if (!auth.currentUser) return;
    try {
      localStorage.setItem(
        `teacher-assigned:${auth.currentUser.uid}:${date}`,
        JSON.stringify(assignedKeys),
      );
    } catch {}
  }, [assignedKeys, date]);
  useEffect(() => {
    let active = true;
    setDraftLoadedKey("");
    setHomeworkData(null);
    setNotice("");
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
      setWordCorrect(value.wordCorrect ?? value.wordTest?.correct ?? "");
      setWordTotal(
        value.wordTotal ??
          value.wordTest?.total ??
          student?.wordTestQuestionCount ??
          20,
      );
      setWordRange(
        value.wordRange ??
          value.wordTest?.range ??
          student?.wordTestCurrentRange ??
          null,
      );
      setNextWordRange(
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
      setAttendance(value.attendance ?? value.status ?? "present");
      setOriginalDate(value.originalDate || value.originalLessonDate || "");
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
            ? "この端末の一時保存を復元しました。"
            : value.existingDraft
              ? "共有された一時保存を復元しました。"
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
    try {
      localStorage.setItem(
        draftLoadedKey,
        JSON.stringify({
          reviewId,
          itemResults,
          commentIds,
          late,
          forgot,
          note,
          wordCorrect,
          wordTotal,
          wordRange,
          nextWordRange,
          wordRangeMode,
          learningContent,
          reportFacts,
          attendance,
          originalDate,
          nextItems,
          dueDate,
          homework,
          nextId: assignmentId,
          nextVersion: assignmentVersion,
        }),
      );
    } catch {}
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
    homework,
    assignmentId,
    assignmentVersion,
    attendance,
    dirty,
  ]);
  useEffect(() => {
    const warn = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
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
  const draftPayload = () => ({
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
    attendance,
    originalDate,
    nextItems,
    dueDate,
    homework,
    nextId: assignmentId,
    nextVersion: assignmentVersion,
  });
  const saveDraft = async () => {
    if (!studentKey || !draftLoadedKey) return;
    setSaving(true);
    try {
      const result = await api("/api/teacher/context", {
        method: "POST",
        body: JSON.stringify({ date, studentKey, payload: draftPayload() }),
      });
      try {
        localStorage.setItem(draftLoadedKey, JSON.stringify(draftPayload()));
      } catch {}
      setDirty(true);
      setContext((old) => ({
        ...old,
        draftStatus: {
          ...(old.draftStatus || {}),
          [studentKey]: { missingFields: result.missingFields || [] },
        },
      }));
      setNotice(
        result.missingFields?.length
          ? `一時保存しました。未入力：${result.missingFields.join("、")}`
          : "一時保存しました。",
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (!student || saving || !draftLoadedKey || !homeworkData) return;
    if (!attendance)
      return setNotice("出席・欠席・振替出席のいずれかを選択してください。");
    setSaving(true);
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
      if(wordEnabled&&attendance!=="absent"&&wordCorrect!==""&&!validItems.some(item=>item.materialId==='words'))validItems=[...validItems,{subject:'english',materialId:'words',range:`${automaticWordRange.start}-${automaticWordRange.end}`,note:'次回単語テスト予定',difficulty:2}];
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
      const learningRecord = {
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
                  ...(wordRange ? { range: wordRange } : {}),
                  ...(nextWordRange ? { nextRange: nextWordRange, nextRangeMode: wordRangeMode } : {}),
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
        nextLessonNote,
      };
      if (attendance === "makeup" && !originalDate)
        throw new Error("振替元の授業日を入力してください。");
      if (student.grade >= 7 && student.grade <= 9)
        await api("/api/admin/lesson-records", {
          method: "POST",
          body: JSON.stringify({
            uid: student.id,
            date,
            termId,
            weekId,
            homeworkReview,
            commentIds,
            record: {
              ...learningRecord,
              nextLessonNote,
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
            originalDate,
            nextLessonNote,
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
      setNotice("授業記録を保存しました。");
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
      setNotice(
        `${lessonSaved ? "授業記録は保存済みですが、新しい宿題を保存できませんでした。 " : ""}${error.message}`,
      );
    } finally {
      setSaving(false);
    }
  };
  const scheduled = (context?.students || []).filter((item) => item.scheduled),
    completed = scheduled.filter(
      (item) => context?.inputStatus?.[item.key],
    ).length;
  return (
    <main className={`teacher-shell ${embedded ? "teacher-embedded" : ""}`}>
      <header>
        <div>
          <small>{embedded ? "ADMIN LESSON INPUT" : "TEACHER CONSOLE"}</small>
          <h1>{embedded ? "学習記録を入力" : "授業後の入力"}</h1>
          <p>
            {context?.displayName || ""}
            　その日に担当した生徒を選択してください。
          </p>
        </div>
        {!embedded && (
          <button
            onClick={() =>
              signOut(auth).then(() => (location.href = "/teacher/login"))
            }
          >
            ログアウト
          </button>
        )}
      </header>
      <nav className="teacher-work-tabs">
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
      </nav>
      <fieldset
        className="teacher-edit-fields"
        disabled={saving}
        onChange={(event) => {
          if (!event.target.closest(".teacher-flow,.teacher-assignment-panel"))
            setDirty(true);
        }}
        onClick={(event) => {
          if (
            event.target.closest("button") &&
            !event.target.closest(
              ".teacher-flow,.teacher-assignment-panel,.teacher-save",
            )
          )
            setDirty(true);
        }}
      >
        {context && (
          <div className="teacher-daily-status">
            <span>
              <strong>{scheduled.length}</strong>予定
            </span>
            <span className="done">
              <strong>{completed}</strong>入力済み
            </span>
            <span className="pending">
              <strong>{Math.max(0, scheduled.length - completed)}</strong>未入力
            </span>
          </div>
        )}
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
            <div className="teacher-assignment-list">
              {filteredStudents.map((item) => (
                <label
                  key={item.key}
                  className={assignedKeys.includes(item.key) ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={assignedKeys.includes(item.key)}
                    onChange={() => toggleAssigned(item.key)}
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.lessonStartTime || "時刻未設定"}・
                      {gradeLabel(item.grade)}
                    </small>
                  </span>
                  <b>
                    {context?.inputStatus?.[item.key] ? "入力済み" : "未入力"}
                  </b>
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
            <div className="teacher-student-picker">
              <span>選択した担当生徒</span>
              <div className="teacher-quick-students">
                {assignedStudents.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={studentKey === item.key ? "selected" : ""}
                    onClick={() => changeStudent(item.key)}
                  >
                    <strong>{item.name}</strong>
                    <small>
                      {item.lessonStartTime || "時刻未設定"}
                      {context?.inputStatus?.[item.key]
                        ? "・入力済み"
                        : "・未入力"}
                    </small>
                  </button>
                ))}
              </div>
              {!assignedStudents.length && (
                <p className="teacher-empty-students">
                  「担当生徒を選択」から入力対象を選んでください。
                </p>
              )}
            </div>
          </section>
        )}
        {activeTab === "info" && (
          <section className="teacher-student-info-list">
            <h2>担当生徒の情報</h2>
            {assignedStudents.map((item) => {
              const info = context?.guidanceByStudent?.[item.key] || {};
              return (
                <details key={item.key} open>
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
                  {!Object.values(info).some(Boolean) && (
                    <p>登録された共有情報はありません。</p>
                  )}
                </details>
              );
            })}
          </section>
        )}
        {student && homeworkData && (
          <div className="teacher-selected-student">
            <strong>{student.realName || student.name}</strong>
            <small>
              {student.lessonStartTime
                ? `${student.lessonStartTime}開始 · `
                : ""}
              {gradeLabel(student.grade)} · {date}
            </small>
          </div>
        )}
        {activeTab === "report" && student && homeworkData && (
          <section className="teacher-attendance-section">
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
                  onClick={() => setAttendance(value)}
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
            <details className="teacher-guidance" open>
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
            <section>
              <h2>今回の確認</h2>
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
                          {item.dueDate}予定：
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
                  <summary>単語テストを入力{student?.wordTestCurrentRange ? `（No.${student.wordTestCurrentRange.start}〜${student.wordTestCurrentRange.end}）` : ''}</summary>
                  <div className="teacher-word">
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
                    <label>
                      問題数
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={wordTotal}
                        onChange={(e) => setWordTotal(e.target.value)}
                      />
                    </label>
                  </div>
                  {wordCorrect !== "" && (
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
                  {[['workbook','ワーク'],['stationery','筆記用具'],['other','その他']].map(([id,label])=><label key={id}><input type="checkbox" checked={forgotItems.includes(id)} onChange={()=>{setForgotItems(old=>{const next=old.includes(id)?old.filter(value=>value!==id):[...old,id];setForgot(next.length>0);return next})}}/>{label}</label>)}
                  {forgotItems.includes('other')&&<input aria-label="その他の忘れ物" placeholder="その他の内容" value={forgotOther} onChange={event=>setForgotOther(event.target.value)}/>}
                </div>
              )}
            </section>
            <section>
              <h2>次回までの宿題</h2>
              <p className="teacher-help">
                通常は次回授業で確認します。教材、範囲、難易度を入力してください。
              </p>
              {nextItems.map((item, index) => (
                <HomeworkAssignmentRow
                  key={index}
                  item={item}
                  materials={materials}
                  elementary={isElementary}
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
        {student && (
          <div className="teacher-save-actions">
            <button
              type="button"
              disabled={!dirty || !draftLoadedKey || saving}
              onClick={saveDraft}
            >
              一時保存
            </button>
          </div>
        )}
        {student && homeworkData && student.grade < 10 && (
          <section className="teacher-report-section">
            <LessonReportFields
              learningContent={learningContent}
              onLearningContentChange={setLearningContent}
              value={reportFacts}
              onChange={setReportFacts}
              context={{
                grade: gradeLabel(student?.grade),
                subject: student?.lessonSubject || "",
              }}
              studentKey={studentKey}
              lessonDate={date}
            />
            <label className="teacher-private-note">
              次回授業メモ<small>次の通常授業で講師に一度だけ表示します</small>
              <textarea value={nextLessonNote} maxLength="1000" onChange={(e)=>setNextLessonNote(e.target.value)} placeholder="例：次回P.46から" />
            </label>
            <label className="teacher-private-note">
              教室内メモ<small>管理者・講師だけが確認します</small>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="保護者には表示されません"
              />
            </label>
          </section>
        )}
        {student && (
          <div className="teacher-final-save-action">
            <button
              className="teacher-save"
              disabled={
                saving ||
                !homeworkData ||
                draftLoadedKey !==
                  `teacher-draft:${auth.currentUser?.uid}:${date}:${studentKey}`
              }
              onClick={save}
            >
              {saving ? "保存中…" : "この授業記録を保存"}
            </button>
          </div>
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
      </fieldset>
    </main>
  );
}
