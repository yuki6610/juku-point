"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/../firebaseConfig";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import "./scores.css";

const GRADES = ["中1", "中2", "中3"];
const SCHOOL_YEARS = ["2025", "2026", "2027", "2028"];
const TERMS = ["1学期", "2学期", "3学期"];
const BASE_TEST_TYPES = [
  "中間",
  "期末",
  "春課題実力",
  "1学期実力",
  "夏課題実力",
  "2学期実力",
  "冬課題実力",
  "3学期実力",
];
const PAST_EXAMS = Array.from({ length: 10 }, (_, index) => `過去問${2016 + index}`);
const MAIN = ["国語", "社会", "数学", "理科", "英語"];
const SUB = ["音楽", "美術", "保体", "技家"];

const emptyExam = () => Object.fromEntries(MAIN.map((subject) => [subject, ""]));
const defaultInternal = (subjects) =>
  Object.fromEntries(subjects.map((subject) => [subject, 3]));
const gradeNumber = (label) => Number(label.replace("中", "")) + 6;
const gradeLabel = (grade) => (grade >= 7 && grade <= 9 ? `中${grade - 6}` : "学年不明");

export default function StudentScoresPage() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [profile, setProfile] = useState(null);
  const [activeView, setActiveView] = useState("record");
  const [recordType, setRecordType] = useState("exam");
  const [schoolYear, setSchoolYear] = useState("2026");
  const [grade, setGrade] = useState("中1");
  const [term, setTerm] = useState("1学期");
  const [testType, setTestType] = useState("中間");
  const [internalGrade, setInternalGrade] = useState("中1");
  const [internalTerm, setInternalTerm] = useState("1学期");
  const [exam, setExam] = useState(emptyExam);
  const [internalMain, setInternalMain] = useState(() => defaultInternal(MAIN));
  const [internalSub, setInternalSub] = useState(() => defaultInternal(SUB));
  const [saved, setSaved] = useState([]);
  const [schools, setSchools] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedInternalId, setSelectedInternalId] = useState("");
  const [openSchool, setOpenSchool] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setCheckingAuth(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const stopScores = onSnapshot(
      query(collection(db, `users/${user.uid}/scores`), orderBy("createdAt", "desc")),
      (snapshot) => setSaved(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setNotice({ tone: "error", text: "成績データを読み込めませんでした。" }),
    );
    const stopSchools = onSnapshot(
      collection(db, "schools"),
      (snapshot) => setSchools(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setNotice({ tone: "error", text: "志望校データを読み込めませんでした。" }),
    );
    const stopProfile = onSnapshot(doc(db, "users", user.uid), (snapshot) =>
      setProfile(snapshot.data()),
    );

    return () => {
      stopScores();
      stopSchools();
      stopProfile();
    };
  }, [user]);

  const examTotal = Object.values(exam).reduce(
    (total, value) => total + Number(value || 0),
    0,
  );
  const examConverted = examTotal * 0.5;
  const internalTotal =
    Object.values(internalMain).reduce((total, value) => total + value, 0) * 4 +
    Object.values(internalSub).reduce((total, value) => total + value, 0) * 7.5;
  const selectedExam = saved.find((score) => score.id === selectedExamId);
  const selectedInternal = saved.find((score) => score.id === selectedInternalId);
  const finalTotal =
    (selectedExam?.examConverted || 0) + (selectedInternal?.internalTotal || 0);
  const hasJudgement = Boolean(selectedExam && selectedInternal);
  const examRecords = saved.filter((score) => score.type === "exam");
  const internalRecords = saved.filter((score) => score.type === "internal");

  const isPastExamStudent =
    profile?.grade === 9 &&
    Array.isArray(profile?.courseTags) &&
    profile.courseTags.includes("past_exam");
  const testTypes =
    isPastExamStudent && grade === "中3"
      ? [...BASE_TEST_TYPES, ...PAST_EXAMS]
      : BASE_TEST_TYPES;

  const sortedSchools = useMemo(
    () => [...schools].sort((a, b) => Number(b.minScore || 0) - Number(a.minScore || 0)),
    [schools],
  );

  const judgeResult = (score, minimum) => {
    const difference = score - Number(minimum || 0);
    if (difference >= 20) return { label: "安全圏", className: "safe" };
    if (difference >= 0) return { label: "合格圏", className: "ok" };
    if (difference >= -20) return { label: "努力圏", className: "warn" };
    return { label: "要対策", className: "ng" };
  };

  const showNotice = (tone, text) => {
    setNotice({ tone, text });
    window.setTimeout(() => setNotice(null), 3500);
  };

  const saveExam = async () => {
    if (saving) return;
    const values = Object.values(exam);
    if (values.some((value) => value === "")) {
      showNotice("error", "五教科すべての点数を入力してください。");
      return;
    }
    if (values.some((value) => Number(value) > 100)) {
      showNotice("error", "点数は0〜100点で入力してください。");
      return;
    }
    const duplicate = saved.some(
      (score) =>
        score.type === "exam" &&
        score.year === schoolYear &&
        score.grade === gradeNumber(grade) &&
        score.term === term &&
        score.testType === testType,
    );
    if (duplicate) {
      showNotice("error", "同じ年度・学年・学期・テストの成績が登録済みです。");
      return;
    }
    if (!window.confirm("この内容でテスト成績を保存しますか？")) return;

    setSaving(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/scores`), {
        type: "exam",
        year: schoolYear,
        grade: gradeNumber(grade),
        term,
        testType,
        exam,
        examTotal,
        examConverted,
        approved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setExam(emptyExam());
      showNotice("success", "テスト成績を保存しました。管理者の確認後に確定します。");
    } catch (error) {
      console.error("テスト成績の保存に失敗しました:", error);
      showNotice("error", "保存できませんでした。通信環境を確認してください。");
    } finally {
      setSaving(false);
    }
  };

  const saveInternal = async () => {
    if (saving) return;
    const duplicate = saved.some(
      (score) =>
        score.type === "internal" &&
        score.year === schoolYear &&
        score.grade === gradeNumber(internalGrade) &&
        score.term === internalTerm,
    );
    if (duplicate) {
      showNotice("error", "同じ年度・学年・学期の内申点が登録済みです。");
      return;
    }
    if (!window.confirm("この内容で内申点を保存しますか？")) return;

    setSaving(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/scores`), {
        type: "internal",
        year: schoolYear,
        grade: gradeNumber(internalGrade),
        term: internalTerm,
        internalMain,
        internalSub,
        internalTotal,
        approved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showNotice("success", "内申点を保存しました。管理者の確認後に確定します。");
    } catch (error) {
      console.error("内申点の保存に失敗しました:", error);
      showNotice("error", "保存できませんでした。通信環境を確認してください。");
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth) {
    return <main className="scores-state">成績データを確認しています…</main>;
  }
  if (!user) {
    return <main className="scores-state">ログインしてください</main>;
  }

  return (
    <main className="scores-page">
      <header className="scores-hero">
        <div>
          <span className="scores-eyebrow">ACADEMIC RECORD</span>
          <h1>成績・志望校</h1>
          <p>記録する、組み合わせる、志望校と比べる。順番に進めれば判定できます。</p>
        </div>
        <div className="scores-hero-stats" aria-label="登録状況">
          <div>
            <strong>{examRecords.length}</strong>
            <span>テスト記録</span>
          </div>
          <div>
            <strong>{internalRecords.length}</strong>
            <span>内申記録</span>
          </div>
        </div>
      </header>

      <nav className="scores-view-tabs" aria-label="成績ページの表示切り替え">
        <button
          type="button"
          className={activeView === "record" ? "active" : ""}
          onClick={() => setActiveView("record")}
        >
          <span>1</span>
          成績を記録
        </button>
        <button
          type="button"
          className={activeView === "judge" ? "active" : ""}
          onClick={() => setActiveView("judge")}
        >
          <span>2</span>
          志望校を判定
        </button>
      </nav>

      {notice && (
        <div className={`scores-notice ${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      {activeView === "record" ? (
        <section className="scores-panel" aria-labelledby="record-title">
          <div className="section-heading">
            <div>
              <span>STEP 1</span>
              <h2 id="record-title">成績を記録する</h2>
            </div>
            <label className="year-select">
              <span>年度</span>
              <select value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)}>
                {SCHOOL_YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}年度
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="record-type-tabs">
            <button
              type="button"
              className={recordType === "exam" ? "active" : ""}
              onClick={() => setRecordType("exam")}
            >
              五教科テスト
            </button>
            <button
              type="button"
              className={recordType === "internal" ? "active" : ""}
              onClick={() => setRecordType("internal")}
            >
              内申点
            </button>
          </div>

          {recordType === "exam" ? (
            <div className="score-form">
              <div className="form-selects three">
                <label>
                  <span>学年</span>
                  <select value={grade} onChange={(event) => setGrade(event.target.value)}>
                    {GRADES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>学期</span>
                  <select value={term} onChange={(event) => setTerm(event.target.value)}>
                    {TERMS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>テスト</span>
                  <select value={testType} onChange={(event) => setTestType(event.target.value)}>
                    {testTypes.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </div>

              <div className="subject-grid">
                {MAIN.map((subject) => (
                  <label key={subject}>
                    <span>{subject}</span>
                    <div>
                      <input
                        value={exam[subject]}
                        inputMode="numeric"
                        aria-label={`${subject}の点数`}
                        placeholder="0"
                        onChange={(event) => {
                          const value = event.target.value.replace(/\D/g, "").slice(0, 3);
                          setExam((current) => ({ ...current, [subject]: value }));
                        }}
                      />
                      <small>点</small>
                    </div>
                  </label>
                ))}
              </div>

              <div className="score-total">
                <span>五教科合計</span>
                <strong>{examTotal}<small> / 500点</small></strong>
                <em>入試換算 {examConverted}点</em>
              </div>
              <button className="save-score-button" type="button" onClick={saveExam} disabled={saving}>
                {saving ? "保存しています…" : "テスト成績を保存"}
              </button>
            </div>
          ) : (
            <div className="score-form">
              <div className="form-selects two">
                <label>
                  <span>学年</span>
                  <select
                    value={internalGrade}
                    onChange={(event) => setInternalGrade(event.target.value)}
                  >
                    {GRADES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>学期</span>
                  <select
                    value={internalTerm}
                    onChange={(event) => setInternalTerm(event.target.value)}
                  >
                    {TERMS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
              </div>

              <p className="subject-group-label">五教科</p>
              <div className="internal-grid">
                {MAIN.map((subject) => (
                  <label key={subject}>
                    <span>{subject}</span>
                    <select
                      value={internalMain[subject]}
                      onChange={(event) =>
                        setInternalMain((current) => ({
                          ...current,
                          [subject]: Number(event.target.value),
                        }))
                      }
                    >
                      {[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              <p className="subject-group-label">実技四教科</p>
              <div className="internal-grid sub">
                {SUB.map((subject) => (
                  <label key={subject}>
                    <span>{subject}</span>
                    <select
                      value={internalSub[subject]}
                      onChange={(event) =>
                        setInternalSub((current) => ({
                          ...current,
                          [subject]: Number(event.target.value),
                        }))
                      }
                    >
                      {[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              <div className="score-total internal">
                <span>内申点</span>
                <strong>{internalTotal}<small> 点</small></strong>
                <em>入力と同時に自動計算</em>
              </div>
              <button
                className="save-score-button internal"
                type="button"
                onClick={saveInternal}
                disabled={saving}
              >
                {saving ? "保存しています…" : "内申点を保存"}
              </button>
            </div>
          )}

          <div className="recent-records">
            <div className="subsection-heading">
              <h3>最近の記録</h3>
              <span>{saved.length}件</span>
            </div>
            {saved.length === 0 ? (
              <p className="empty-copy">保存した成績はここに表示されます。</p>
            ) : (
              <div className="record-list">
                {saved.slice(0, 4).map((score) => (
                  <article key={score.id}>
                    <span className={`record-icon ${score.type}`}>
                      {score.type === "exam" ? "試" : "内"}
                    </span>
                    <div>
                      <strong>
                        {gradeLabel(score.grade)} {score.term}{" "}
                        {score.type === "exam" ? score.testType : "内申点"}
                      </strong>
                      <small>{score.year || "年度不明"}年度</small>
                    </div>
                    <b>
                      {score.type === "exam" ? `${score.examTotal}点` : `${score.internalTotal}点`}
                    </b>
                    <em className={score.approved ? "approved" : ""}>
                      {score.approved ? "確認済" : "確認待ち"}
                    </em>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="scores-panel" aria-labelledby="judge-title">
          <div className="section-heading">
            <div>
              <span>STEP 2</span>
              <h2 id="judge-title">志望校と比べる</h2>
              <p>判定に使うテストと内申点を1つずつ選んでください。</p>
            </div>
          </div>

          <div className="judge-selects">
            <label>
              <span><b>1</b> テスト成績</span>
              <select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
                <option value="">選択してください</option>
                {examRecords.map((score) => (
                  <option key={score.id} value={score.id}>
                    {gradeLabel(score.grade)} {score.term} {score.testType}｜{score.examTotal}点
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span><b>2</b> 内申点</span>
              <select
                value={selectedInternalId}
                onChange={(event) => setSelectedInternalId(event.target.value)}
              >
                <option value="">選択してください</option>
                {internalRecords.map((score) => (
                  <option key={score.id} value={score.id}>
                    {gradeLabel(score.grade)} {score.term}｜{score.internalTotal}点
                  </option>
                ))}
              </select>
            </label>
          </div>

          {hasJudgement ? (
            <>
              <div className="combined-score">
                <span>判定に使う合計点</span>
                <strong>{finalTotal}<small>点</small></strong>
                <p>テスト換算点＋内申点</p>
              </div>
              <ScoreBreakdown exam={selectedExam} internal={selectedInternal} />

              <div className="subsection-heading school-heading">
                <div>
                  <span>RESULT</span>
                  <h3>志望校比較</h3>
                </div>
                <small>{sortedSchools.length}校</small>
              </div>
              <div className="school-list">
                {sortedSchools.map((school) => {
                  const result = judgeResult(finalTotal, school.minScore);
                  const open = openSchool === school.id;
                  const minimumDifference = finalTotal - Number(school.minScore || 0);
                  const averageDifference = finalTotal - Number(school.averageScore || 0);
                  const internalDifference =
                    Number(selectedInternal?.internalTotal || 0) -
                    Number(school.internalTarget || 0);
                  const examDifference =
                    Number(selectedExam?.examTotal || 0) - Number(school.scoreTarget || 0);

                  return (
                    <article key={school.id} className="school-card">
                      <button
                        type="button"
                        className="school-header"
                        onClick={() => setOpenSchool(open ? null : school.id)}
                        aria-expanded={open}
                      >
                        <div>
                          <strong>{school.name}</strong>
                          <small>偏差値 {school.deviation ?? "—"}</small>
                        </div>
                        <span className={`judge-badge ${result.className}`}>{result.label}</span>
                        <i aria-hidden="true">{open ? "−" : "+"}</i>
                      </button>
                      {open && (
                        <div className="school-body">
                          <ScoreRow label="合格最低点" target={school.minScore} mine={finalTotal} difference={minimumDifference} />
                          <ScoreRow label="平均点" target={school.averageScore} mine={finalTotal} difference={averageDifference} />
                          <ScoreRow label="内申点目安" target={school.internalTarget} mine={selectedInternal?.internalTotal} difference={internalDifference} />
                          <ScoreRow label="五教科目安" target={school.scoreTarget} mine={selectedExam?.examTotal} difference={examDifference} />
                          <div className="rate-row"><span>倍率</span><strong>{school.rate ?? "—"}</strong></div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="judge-empty">
              <span aria-hidden="true">↗</span>
              <h3>2つの記録を選ぶと判定できます</h3>
              <p>
                まだ記録がない場合は、「成績を記録」からテストと内申点を登録してください。
              </p>
              <button type="button" onClick={() => setActiveView("record")}>
                成績を記録する
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function ScoreRow({ label, target, mine, difference }) {
  const hasTarget = target !== undefined && target !== null && target !== "";
  const hasMine = mine !== undefined && mine !== null && mine !== "";
  const canCompare = hasTarget && hasMine;

  return (
    <div className="comparison-row">
      <span>{label}</span>
      <div>
        <small>目安</small>
        <strong>{hasTarget ? `${target}点` : "—"}</strong>
      </div>
      <div>
        <small>あなた</small>
        <strong>{hasMine ? `${mine}点` : "—"}</strong>
      </div>
      <em className={canCompare && difference >= 0 ? "safe" : "ng"}>
        {canCompare ? `${difference >= 0 ? "+" : ""}${difference}点` : "—"}
      </em>
    </div>
  );
}
