"use client";
import { useAcademicContext } from '@/lib/useAcademicContext';
import { resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import HomeworkReview from '@/components/HomeworkReview';
import LessonReportFields from '@/components/LessonReportFields';
import HomeworkAssignmentRow from '@/components/HomeworkAssignmentRow';
import { homeworkValue, validateAssignment } from '@/lib/homeworkModel.mjs';
import { homeworkApi } from '@/lib/homeworkClient';
import { availableStudentGrades } from '@/lib/studentFilterOptions.mjs';

import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from 'next/navigation';
import { lessonStudent, isMiddleStudent, studentGradeLabel } from '@/lib/lessonStudents.mjs';
import {
  collection,
  doc,
  getDoc,
  getDocs,
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
const plusDays = (value, days) => { const next = new Date(`${value}T12:00:00`); next.setDate(next.getDate() + days); return next.toISOString().slice(0, 10); };


export default function LearningRecordForm({ isDirty = false, onDirtyChange = () => {}, onBusyChange = () => {} }) {
  const params = useSearchParams();
  const academic = useAcademicContext();
  const currentYear = new Date().getFullYear();
  const [students, setStudents] = useState([]);
  const availableGrades = useMemo(() => availableStudentGrades(students), [students]);
  const [studentId, setStudentId] = useState("");
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
  const [wordRangeMode, setWordRangeMode] = useState("same");
  const [wordRange, setWordRange] = useState(null);
  const [nextWordRange, setNextWordRange] = useState(null);
  const [late, setLate] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [behaviorNote, setBehaviorNote] = useState("");
  const [nextLessonNote, setNextLessonNote] = useState("");
  const [learningContent, setLearningContent] = useState("");
  const [reportFacts, setReportFacts] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  const [recordReady, setRecordReady] = useState(false);
  const [homeworkReady, setHomeworkReady] = useState(false);
  const [homeworkReview, setHomeworkReview] = useState(null);
  const [assignmentData, setAssignmentData] = useState(null);
  const [assignmentReady, setAssignmentReady] = useState(false);
  const [assignmentId, setAssignmentId] = useState('');
  const [assignmentVersion, setAssignmentVersion] = useState(null);
  const [nextItems, setNextItems] = useState([{ subject:'all', materialId: '', range: '', customLabel:'', difficulty:3 }]);
  const [dueDate, setDueDate] = useState('');
  const [commentIds, setCommentIds] = useState([]);
  const [absenceCandidates,setAbsenceCandidates]=useState([]);
  const loadVersion = useRef(0);
  const draftApplied = useRef('');
  const [notice, setNotice] = useState("");
  const confirmSwitch = () => {
    if (saving) return false;
    if (isDirty && !window.confirm('未保存の入力があります。内容を破棄して切り替えますか？')) return false;
    onDirtyChange(false);
    return true;
  };

  const termId = `${academicYear}_${term}`;
  const changeAcademicSelection = (nextYear, nextTerm) => {
    if (!confirmSwitch()) return;
    const entry=academic.settings.find(item=>Number(item.year)===Number(nextYear));
    const period=entry?.terms?.[nextTerm]||entry?.terms?.[String(nextTerm)];
    if(!period?.start){setNotice('選択した年度・学期の期間が設定されていません。');return;}
    setRecordReady(false);setAcademicYear(Number(nextYear));setTerm(Number(nextTerm));
    if(date<period.start||date>period.end)setDate(period.start);
  };
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
      const loaded = [...snapshot.docs.map(item => lessonStudent(item.id, item.data())), ...elementary.docs.map(item => lessonStudent(item.id, item.data(), 'elementary'))].filter(Boolean)
          .sort(
            (a, b) =>
              Number(a.grade || 0) - Number(b.grade || 0) ||
              String(a.realName || a.displayName || "").localeCompare(
                String(b.realName || b.displayName || ""),
                "ja"
              )
          );
      setStudents(loaded);
      const requested = params.get('student');
      if (requested && loaded.some(item=>item.uid===requested)) setStudentId(requested);
      if (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date')||'')) setDate(params.get('date'));
    }).catch(() => setNotice('生徒一覧を取得できませんでした。再読み込みしてください。'));
  }, [params]);

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
    return students.filter((student) => {
      if (grade !== "all" && Number(student.grade) !== Number(grade)) return false;
      return true;
    });
  }, [students, grade]);

  const selectedStudent = students.find((student) => student.uid === studentId);
  const selectedGrade = Number(selectedStudent?.grade || 0);
  const isElementary = selectedGrade >= 1 && selectedGrade <= 6;
  const isHigh = selectedGrade >= 10 && selectedGrade <= 12;
  const elementaryEnglish=isElementary&&(Object.values(selectedStudent?.lessonSchedule?.slots||selectedStudent?.lessonScheduleSlots||{}).some(slot=>String(slot?.subject||'').toLowerCase().includes('english')||String(slot?.subject||'').includes('英語'))||nextItems.some(item=>item.subject==='english'));
  const wordEnabled=isMiddleStudent(selectedStudent)||elementaryEnglish;
  const wordRangeBase = selectedStudent?.wordTestCurrentRange || { start: 1, end: Number(selectedStudent?.wordTestQuestionCount || wordTotal || 20) };
  const currentWordRange = wordRange || wordRangeBase;
  const wordRangeChoices = {
    same: currentWordRange,
    next: { start: Number(currentWordRange.end) + 1, end: Number(currentWordRange.end) + Number(wordTotal || selectedStudent?.wordTestQuestionCount || 20) },
  };
  useEffect(() => { if (isHigh) setHomeworkReady(true); }, [isHigh]);
  const materials = (assignmentData?.templates?.materials || []).filter(item => !item.audience || item.audience === 'all' || item.audience === (isElementary ? 'elementary' : 'middle'));

  useEffect(() => {
    let active = true;
    setAssignmentReady(false);
    setAssignmentData(null);
    setAssignmentId(crypto.randomUUID());
    setAssignmentVersion(null);
    setNextItems([{ subject:'all', materialId: '', range: '', customLabel:'', difficulty:3 }]);
    setDueDate(date ? plusDays(date, 7) : '');
    if (!studentId || !date || isHigh) { setAssignmentReady(true); return () => { active = false; }; }
    homeworkApi(`/api/admin/homework?student=${encodeURIComponent(studentId)}&date=${date}`)
      .then(value => {
        if (!active) return;
        setAssignmentData(value);
        const existing = value.items?.find(item => item.assignedDate === date);
        if (existing) {
          setAssignmentId(existing.id);
          setAssignmentVersion(existing.version);
          setNextItems(existing.items.map(item => ({ subject:item.subject || value.templates.materials.find(material=>material.id===item.materialId)?.subject || 'all', materialId: item.materialId, range: item.range, note:item.note||'', customLabel:item.customLabel||'', difficulty:Number(item.difficulty||3) })));
          setDueDate(existing.dueDate);
        }
        setAssignmentReady(true);
      })
      .catch(() => { if (active) setNotice('次回の宿題を読み込めませんでした。再読み込みしてください。'); });
    return () => { active = false; };
  }, [studentId, date, isHigh]);

  useEffect(()=>{let active=true;setAbsenceCandidates([]);if(!studentId||!date)return()=>{active=false};auth.currentUser?.getIdToken().then(token=>fetch(`/api/admin/absence-candidates?student=${encodeURIComponent(studentId)}&date=${date}`,{headers:{Authorization:`Bearer ${token}`}})).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(active)setAbsenceCandidates(data.items||[])}).catch(error=>{if(active)setNotice(error.message)});return()=>{active=false}},[studentId,date]);

  const resetRecordForm = () => {
    setHomeworkReview(null); setCommentIds([]);
    setAttendance("present");
    setOriginalLessonDate("");
    setHomework("none");
    setWordStatus("notScheduled");
    setWordCorrect("");
    setWordTotal(String(selectedStudent?.wordTestQuestionCount || 20));
    const total = Number(selectedStudent?.wordTestQuestionCount || 20), current = selectedStudent?.wordTestCurrentRange;
    const initialRange = current || { start: 1, end: total };
    setWordRangeMode("same"); setWordRange(initialRange); setNextWordRange(initialRange);
    setLate(false);
    setForgot(false);
    setBehaviorNote("");
    setNextLessonNote("");
    setLearningContent(""); setReportFacts({});
  };

  const loadExistingRecord = async (uid, selectedDate, selectedTermId) => {
    const version = ++loadVersion.current;
    setRecordReady(false);
    const student = students.find(item => item.uid === uid);
    if (!student) return;
    const middle = isMiddleStudent(student);
    const recordRef = middle ? doc(db, student.source === 'elementary' ? 'adminStudents' : 'users', student.id, 'lessonTerms', selectedTermId, 'records', selectedDate) : doc(db, 'adminLessonAttendance', student.uid, 'records', selectedDate);
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
    const savedRange = record.wordTest?.range || selectedStudent?.wordTestCurrentRange || { start:1, end:Number(record.wordTest?.total ?? selectedStudent?.wordTestQuestionCount ?? 20) };
    setWordRange(savedRange);
    setNextWordRange(record.wordTest?.nextRange || savedRange);
    setWordRangeMode(record.wordTest?.nextRangeMode || "same");
    setLate(Boolean(record.late));
    setForgot(Boolean(record.forgot));
    setBehaviorNote(record.behaviorNote || "");
    setLearningContent(record.learningContent || ""); setReportFacts(record.reportFacts || {});
    setNotice("この日付の保存済み記録を読み込みました。");
  };

  useEffect(() => {
    setNotice("");
    if (studentId && date) loadExistingRecord(studentId, date, termId).catch(() => { setRecordReady(false); setNotice('保存済み記録を取得できませんでした。再読み込みしてください。'); });
    return () => { loadVersion.current++; };
  }, [studentId, date, termId]);

  useEffect(()=>{const key=`${studentId}:${date}`;if(params.get('draft')!=='1'||!studentId||!date||!recordReady||!assignmentReady||draftApplied.current===key)return;draftApplied.current=key;auth.currentUser?.getIdToken().then(token=>fetch(`/api/teacher/context?date=${date}&student=${encodeURIComponent(studentId)}`,{headers:{Authorization:`Bearer ${token}`}})).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);const value=data.existingDraft;if(!value)return;setHomeworkReview(value.reviewId?{assignmentId:value.reviewId,itemResults:value.itemResults||{},status:'pending'}:null);setCommentIds(value.commentIds||[]);setAttendance(value.attendance||'present');setOriginalLessonDate(value.originalDate||'');setHomework(value.homework||'none');setWordCorrect(String(value.wordCorrect??''));setWordTotal(String(value.wordTotal??selectedStudent?.wordTestQuestionCount??20));setWordRange(value.wordRange||null);setNextWordRange(value.nextWordRange||value.wordRange||null);setWordRangeMode(value.wordRangeMode||'same');setLate(value.late===true);setForgot(value.forgot===true);setBehaviorNote(value.note||'');setLearningContent(value.learningContent||'');setReportFacts(value.reportFacts||{});if(Array.isArray(value.nextItems)&&value.nextItems.length)setNextItems(value.nextItems);if(value.dueDate)setDueDate(value.dueDate);if(value.nextId)setAssignmentId(value.nextId);setAssignmentVersion(value.nextVersion??null);onDirtyChange(true);setNotice('講師の一時保存を読み込みました。確認して保存してください。')}).catch(error=>setNotice(error.message))},[studentId,date,recordReady,assignmentReady,params,selectedStudent,onDirtyChange]);

  const saveRecord = async () => {
    if (!recordReady || !homeworkReady || !assignmentReady || !selectedStudent || saving) return;
    try {
      if (academic.loading || academic.error) throw new Error(academic.error || '学期設定を読み込み中です。');
      if (resolveAcademicTerm(academic.settings, date).id !== termId) throw new Error('授業日と選択した学期が一致しません。');
    } catch (error) { return setNotice(error.message); }
    if (!studentId || !date) return setNotice("生徒と授業日を選択してください。");
    if (!attendance) return setNotice('出席・欠席・振替出席のいずれかを選択してください。');
    let validNextItems = isHigh ? [] : nextItems.filter(item => item.materialId || item.range.trim());
    if(wordEnabled&&attendance!=="absent"&&["completed","makeup"].includes(wordStatus)&&nextWordRange&&!validNextItems.some(item=>item.materialId==='words'))validNextItems=[...validNextItems,{subject:'english',materialId:'words',range:`${nextWordRange.start}-${nextWordRange.end}`,note:'次回単語テスト予定',difficulty:2}];
    const oldAssignment = assignmentData?.items?.find(item => item.id === assignmentId);
    const signature=items=>JSON.stringify(items.map(item => [item.subject,item.materialId,item.customLabel||'',item.range,item.note||'',Number(item.difficulty||3)]));
    const unchangedAssignment = oldAssignment && oldAssignment.dueDate === dueDate && signature(oldAssignment.items) === signature(validNextItems);
    try {
      if (oldAssignment && !validNextItems.length) throw new Error('登録済みの宿題は空欄で削除できません。');
      if (oldAssignment?.review && !['pending', 'absent'].includes(oldAssignment.review.status) && !unchangedAssignment) throw new Error('確認済みの宿題は変更できません。');
      if (validNextItems.length && !unchangedAssignment) validateAssignment({ assignedDate: date, dueDate, items: validNextItems }, assignmentData?.templates);
    } catch (error) { return setNotice(error.message); }
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
    let lessonSaved = false;
    try {
      const weekId = `${academicYear}-W${String(getWeekNumber(date)).padStart(2, "0")}`;
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("管理者のログイン情報がありません。");
      if (!isMiddleStudent(selectedStudent)) {
        const response = await fetch('/api/admin/lesson-attendance', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'save', student: { id: selectedStudent.id, source: selectedStudent.source, grade: selectedStudent.grade }, date, status: attendance, originalDate: originalLessonDate, note: behaviorNote, homeworkReview, commentIds,
            nextLessonNote, learningRecord: { homework: attendance === 'absent' ? 'notEvaluated' : homework, wordTest: { status: wordStatus, correct: wordCorrect, total: wordTotal, ...(["completed","makeup"].includes(wordStatus)&&wordRange?{range:wordRange}:{}), ...(["completed","makeup"].includes(wordStatus)&&nextWordRange?{nextRange:nextWordRange,nextRangeMode:wordRangeMode}:{}) }, late: attendance !== 'absent' && late, forgot: attendance !== 'absent' && forgot, behaviorNote, nextLessonNote, learningContent, reportFacts } }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '保存できませんでした。');
        lessonSaved = true;
        await saveNextHomework(validNextItems, unchangedAssignment);
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
          uid: selectedStudent.source === 'elementary' ? `elementary_${selectedStudent.id}` : selectedStudent.id,
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
            ...((wordStatus === "completed" || wordStatus === "makeup") && wordRange ? { range: wordRange } : {}),
            ...((wordStatus === "completed" || wordStatus === "makeup") && nextWordRange ? { nextRange: nextWordRange, nextRangeMode: wordRangeMode } : {}),
          },
          late: attendance === "absent" ? false : late,
          forgot: attendance === "absent" ? false : forgot,
          behaviorNote: behaviorNote.trim(),
          learningContent: learningContent.trim(),
          reportFacts,
          nextLessonNote,
          },
        }),
      });
      const saveResult = await response.json();
      if (!response.ok) throw new Error(saveResult.error || "保存に失敗しました。");
      lessonSaved = true;
      await saveNextHomework(validNextItems, unchangedAssignment);
      if (wordStatus === "completed" || wordStatus === "makeup") {
        setStudents((current) => current.map((student) =>
          student.uid === studentId
            ? { ...student, wordTestQuestionCount: Number(wordTotal), ...(nextWordRange ? { wordTestCurrentRange:nextWordRange } : {}) }
            : student
        ));
      }

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
      setNotice(`${lessonSaved ? '学習記録は保存済みですが、次回の宿題を保存できませんでした。 ' : ''}${error.message || "保存に失敗しました。通信状態を確認してください。"}`);
    } finally {
      setSaving(false);
    }
  };

  const saveNextHomework = async (validItems, unchanged) => {
    if (!validItems.length || unchanged) return;
    await homeworkApi('/api/admin/homework', { id: assignmentId, version: assignmentVersion, student: studentId, assignedDate: date, dueDate, items: validItems });
    const refreshed = await homeworkApi(`/api/admin/homework?student=${encodeURIComponent(studentId)}&date=${date}`);
    setAssignmentData(refreshed);
    setAssignmentVersion(refreshed.items?.find(item => item.id === assignmentId)?.version ?? null);
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
          <select disabled={saving} value={academicYear} onChange={(e) => changeAcademicSelection(Number(e.target.value),term)}>
            {academic.settings.map(item => item.year).sort((a, b) => a - b).map((year) => (
              <option key={year} value={year}>{year}年度</option>
            ))}
          </select>
          <select disabled={saving} value={term} onChange={(e) => changeAcademicSelection(academicYear,Number(e.target.value))}>
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>{value}学期</option>
            ))}
          </select>
        </div>
      </header>

      <section className="lesson-layout">
        <aside className="student-picker">
          <div className="picker-heading"><div><span>STEP 1</span><h2>授業日と生徒を選択</h2></div><label>授業日<input disabled={saving} type="date" value={date} onChange={(e) => { if (!confirmSwitch()) return; setRecordReady(false); setDate(e.target.value); }} /></label></div>
          <div className="picker-filters"><select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="all">全学年</option>
            {availableGrades.map((value) => (
              <option key={value} value={value}>{gradeLabel(value)}</option>
            ))}
          </select></div>
          <div className="student-list">
            {filteredStudents.map((student) => (
              <button
                key={student.uid}
                className={studentId === student.uid ? "active" : ""}
                disabled={saving}
                onClick={() => { if (studentId !== student.uid && confirmSwitch()) { setRecordReady(false); setStudentId(student.uid); } }}
              >
                <strong>{student.realName || student.displayName || "名前未設定"}</strong>
                <span>{gradeLabel(student.grade)}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="record-panel">
          {!selectedStudent ? (
            <div className="record-empty">上の一覧から生徒を選択してください。</div>
          ) : (
            <>
              <div className="record-title">
                <div>
                  <span>STEP 2　{gradeLabel(selectedStudent.grade)}</span>
                  <h2>{selectedStudent.realName || selectedStudent.displayName}</h2>
                </div>
                <strong className="selected-date">{date}</strong>
              </div>
              {isElementary && <p>小学生は出欠と宿題を記録します。英語受講者は単語テストも記録できますが、ポイント・経験値は付きません。</p>}
              {isHigh && <p>高校生は出席状況のみを記録します。宿題・単語テスト・生活態度は表示しません。</p>}

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
                  <label className="inline-field">振替元の欠席授業<select value={originalLessonDate} onChange={(e)=>setOriginalLessonDate(e.target.value)}><option value="">欠席授業を選択</option>{originalLessonDate&&!absenceCandidates.some(item=>item.date===originalLessonDate)&&<option value={originalLessonDate}>{originalLessonDate}（登録済み）</option>}{absenceCandidates.map(item=><option key={item.date} value={item.date}>{item.date}{item.note?`　${item.note}`:''}</option>)}</select></label>
                )}
              </fieldset>

              {!isHigh && <fieldset className={attendance === "absent" ? "disabled-section" : ""}>
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
              </fieldset>}

              {wordEnabled && <fieldset>
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
                {(wordStatus === "completed" || wordStatus === "makeup") && <><div className="word-range-current"><b>今回の出題範囲</b><span>No.{wordRange?.start || wordRangeBase.start}〜{wordRange?.end || wordRangeBase.end}</span><div className="next-number-range"><input aria-label="今回の単語テスト開始番号" type="number" min="1" value={wordRange?.start||''} onChange={event=>{const next={start:Number(event.target.value),end:Number(wordRange?.end||event.target.value)};setWordRange(next);if(wordRangeMode==='same')setNextWordRange(next)}}/><b>〜</b><input aria-label="今回の単語テスト終了番号" type="number" min="1" value={wordRange?.end||''} onChange={event=>{const next={start:Number(wordRange?.start||event.target.value),end:Number(event.target.value)};setWordRange(next);if(wordRangeMode==='same')setNextWordRange(next)}}/></div></div><label>次回の出題範囲<select value={wordRangeMode} onChange={event=>{const mode=event.target.value;setWordRangeMode(mode);if(mode!=='custom')setNextWordRange(wordRangeChoices[mode]);}}><option value="same">今回と同じ：No.{wordRangeChoices.same.start}〜{wordRangeChoices.same.end}</option><option value="next">次へ進む：No.{wordRangeChoices.next.start}〜{wordRangeChoices.next.end}</option><option value="custom">範囲を手入力・修正</option></select></label></>}
                {(wordStatus === "completed" || wordStatus === "makeup") && wordRangeMode==='custom' && <div className="next-number-range"><input aria-label="次回の単語テスト開始番号" type="number" min="1" value={nextWordRange?.start||''} onChange={event=>setNextWordRange(old=>({start:Number(event.target.value),end:Number(old?.end||event.target.value)}))}/><b>〜</b><input aria-label="次回の単語テスト終了番号" type="number" min="1" value={nextWordRange?.end||''} onChange={event=>setNextWordRange(old=>({start:Number(old?.start||event.target.value),end:Number(event.target.value)}))}/></div>}
                {(wordStatus === "completed" || wordStatus === "makeup") && (
                  <p className="word-total-hint">問題数はこの生徒の次回入力にも引き継がれます。</p>
                )}
              </fieldset>}

              {!isHigh && <fieldset className={attendance === "absent" ? "disabled-section" : ""}>
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
              </fieldset>}

              {!isHigh&&<fieldset><legend>次回授業への引き継ぎ</legend><textarea rows="2" maxLength="1000" value={nextLessonNote} onChange={event=>setNextLessonNote(event.target.value)} placeholder="例：次回P.46から（保護者には表示されません）" /></fieldset>}

              {!isHigh && <fieldset><LessonReportFields learningContent={learningContent} onLearningContentChange={setLearningContent} value={reportFacts} onChange={setReportFacts} context={{grade:gradeLabel(selectedStudent?.grade),subject:(selectedStudent?.lessonSchedule?.slots||selectedStudent?.lessonScheduleSlots||{})[String(new Date(`${date}T12:00:00+09:00`).getDay())]?.subject||''}} studentKey={selectedStudent?.uid || ''} lessonDate={date} /></fieldset>}

              {!isHigh && <fieldset className="next-homework-fieldset" disabled={!assignmentReady || saving}>
                <legend>今回出した宿題・次回確認</legend>
                <p>教材と範囲を入力します。空欄のままなら宿題なしとして学習記録だけ保存します。</p>
                {nextItems.map((item, index) => <HomeworkAssignmentRow key={index} item={item} materials={materials} elementary={isElementary} onChange={value=>setNextItems(old=>old.map((row,i)=>i===index?value:row))} onRemove={()=>setNextItems(old=>old.filter((_,i)=>i!==index))} removeDisabled={nextItems.length===1}/>)}
                <div className="next-homework-actions"><button type="button" disabled={nextItems.length >= 20} onClick={() => setNextItems(old => [...old, { subject:'all', materialId: '', range: '', customLabel:'', difficulty:3 }])}>＋ 宿題を追加</button><details><summary>例外的に確認日を変更</summary><label>確認予定日<input type="date" min={date} value={dueDate} onChange={event => setDueDate(event.target.value)} /></label></details></div>
              </fieldset>}

              {notice && <p className="record-notice" role="status">{notice}</p>}
              <button className="record-save" onClick={saveRecord} disabled={saving || !recordReady || !homeworkReady || !assignmentReady}>
                {saving ? "保存中…" : "学習記録と次回の宿題を保存"}
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
