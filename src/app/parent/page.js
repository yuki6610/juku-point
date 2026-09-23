"use client";
import { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebaseConfig";
import { SCORE_TEST_TYPES } from "@/lib/scoreSubmissionPlan.mjs";
import { schoolDeviationFromTopPercent } from '@/lib/schoolDeviation.mjs';
import ParentServices from "./ParentServices";
import ReferralPanel from "./ReferralPanel";
import "./parent.css";
import "./workflow-improvements.css";
import "./customer-portal.css";
import "./calendar-types.css";

async function parentApi(path, options = {}) {
  const token = await auth.currentUser?.getIdToken(),
    config = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    };
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1)
    try {
      response = await fetch(path, config);
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
const attendanceLabel = { present: "出席", absent: "欠席", makeup: "振替" };
const SUBJECTS = ["国語", "社会", "数学", "理科", "英語"];
export default function ParentPage() {
  const [data, setData] = useState(null),
    [student, setStudent] = useState(""),
    [lessons, setLessons] = useState(null),
    [report, setReport] = useState(null),
    [portal, setPortal] = useState(null),
    [term, setTerm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reportVersion, setReportVersion] = useState(0),
    [previewTools, setPreviewTools] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [readyStudent, setReadyStudent] = useState(""),
    [reportBusy, setReportBusy] = useState(false),
    [moreBusy, setMoreBusy] = useState(false),
    [newsVersion, setNewsVersion] = useState(0);
  const currentStudent = useRef(student);
  currentStudent.current = student;
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) return location.replace("/parent/login");
        try {
          const roleResponse=await fetch('/api/auth/role',{headers:{Authorization:`Bearer ${await user.getIdToken()}`}}),roleData=await roleResponse.json();
          if(!roleResponse.ok||!['parent','admin'].includes(roleData.role)){
            const landing={teacher:'/teacher',student:'/mypage',admin:'/admin'}[roleData.role]||'/parent/login';
            return location.replace(landing);
          }
          const value = await parentApi("/api/parent/context");
          setData(value);
          const requested = new URLSearchParams(window.location.search).get(
            "student",
          );
          setStudent(
            value.children.some((item) => item.key === requested)
              ? requested
              : value.children[0]?.key || "",
          );
        } catch (error) {
          setError(error.message);
        }
      }),
    [],
  );
  useEffect(() => {
    if (!student) return undefined;
    let active = true;
    setError("");
    setBusy(true);
    setLessons(null);
    setReport(null);
    setPortal(null);
    setReadyStudent("");
    Promise.allSettled([
      parentApi(
        `/api/parent/lessons?student=${encodeURIComponent(student)}&detail=summary`,
      ),
      parentApi(
        `/api/parent/portal?student=${encodeURIComponent(student)}&detail=summary`,
      ),
    ])
      .then((results) => {
        if (!active) return;
        const [lessonResult, portalResult] = results;
        if (lessonResult.status === "fulfilled") setLessons(lessonResult.value);
        if (portalResult.status === "fulfilled") setPortal(portalResult.value);
        const failures = results
          .map((result, index) =>
            result.status === "rejected"
              ? ["宿題・授業記録", "お知らせ・予定"][index]
              : null,
          )
          .filter(Boolean);
        if (failures.length)
          setError(
            `${failures.join("、")}を読み込めませんでした。ページを再読み込みしてください。`,
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });

    return () => {
      active = false;
    };
  }, [student]);
  useEffect(() => {
    if (
      !student ||
      !["report", "scores"].includes(activeTab) ||
      readyStudent === student
    )
      return undefined;
    let active = true;
    setReportBusy(true);
    parentApi(`/api/parent/report?student=${encodeURIComponent(student)}`)
      .then((meta) => {
        if (!active) return;
        const selected =
          term && meta.terms.some((item) => item.id === term)
            ? term
            : meta.currentTermId || meta.terms[0]?.id || "";
        setReport({ ...meta, summary: null, scores: [] });
        setTerm(selected);
        setReadyStudent(student);
      })
      .catch((error) => active && setError(error.message))
      .finally(() => active && setReportBusy(false));
    return () => {
      active = false;
    };
  }, [student, activeTab, readyStudent]);
  useEffect(() => {
    if (!student || activeTab !== "calendar" || portal?.detail === "full")
      return undefined;
    let active = true;
    parentApi(
      `/api/parent/portal?student=${encodeURIComponent(student)}&detail=full`,
    )
      .then((value) => active && setPortal(value))
      .catch((error) => active && setError(error.message));
    return () => {
      active = false;
    };
  }, [student, activeTab, portal?.detail]);
  useEffect(() => {
    if (!student || !term || readyStudent !== student) return undefined;
    let active = true;
    setReportBusy(true);
    setReport((previous) =>
      previous ? { ...previous, summary: null, scores: [] } : previous,
    );
    parentApi(
      `/api/parent/report?student=${encodeURIComponent(student)}&term=${term}`,
    )
      .then((value) => {
        if (active) setReport(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setReportBusy(false);
      });
    return () => {
      active = false;
    };
  }, [student, readyStudent, term, reportVersion]);
  const more = async () => {
    if (!lessons?.next || moreBusy) return;
    const key = student;
    setMoreBusy(true);
    try {
      const next = await parentApi(
        `/api/parent/lessons?student=${encodeURIComponent(key)}&after=${encodeURIComponent(lessons.next)}`,
      );
      if (currentStudent.current === key)
        setLessons((old) => ({
          ...old,
          lessons: [
            ...new Map(
              [...old.lessons, ...next.lessons].map((item) => [
                item.date,
                item,
              ]),
            ).values(),
          ],
          next: next.next,
        }));
    } catch (error) {
      if (currentStudent.current === key) setError(error.message);
    } finally {
      setMoreBusy(false);
    }
  };
  const child = data?.children.find((item) => item.key === student);
  useEffect(() => {
    if (
      child &&
      ((Number(child.grade) < 7 && activeTab === "scores") ||
        (Number(child.grade) > 9 && activeTab === "services"))
    )
      setActiveTab("overview");
  }, [child?.grade, activeTab]);
  const middle = Number(child?.grade) >= 7 && Number(child?.grade) <= 9;
  const parentTarget = Number(child?.grade) <= 9;
  const tabs = [
    ["overview", "ホーム"],
    ["lessons", "授業報告"],
    ["calendar", "カレンダー"],
    ...(parentTarget ? [["services", middle ? "講習・面談" : "面談予約"]] : []),
    ...(middle ? [["scores", "成績入力"]] : []),
    ["report", "学期レポート"],
    ["documents", "資料"],
  ];
  const openTab = (id) => {
    if (!tabs.some(([tab]) => tab === id)) return;
    setActiveTab(id);
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const onHash = () => {
      const requested = window.location.hash.slice(1);
      const id = requested === "news" ? "overview" : requested;
      if (
        [
          "overview",
          "lessons",
          "report",
          "scores",
          "services",
          "calendar",
          "documents",
        ].includes(id)
      )
        setActiveTab(id);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return (
    <main
      className="parent-shell"
      onClick={(event) => {
        if (event.defaultPrevented) return;
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const id = link.getAttribute("href")?.slice(1);
        if (tabs.some(([tab]) => tab === id)) {
          event.preventDefault();
          openTab(id);
        }
      }}
    >
      {error && (
        <p className="parent-alert" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          {data.children.length === 0 ? (
            <section>
              <p>紐付けられた生徒がいません。教室へお問い合わせください。</p>
            </section>
          ) : (
            <>
              {data.adminPreview ? (
                previewTools ? (
                  <aside className="parent-preview-tools">
                    <div>
                      <strong>管理者プレビュー</strong>
                      <small>確認する生徒を選択してください</small>
                    </div>
                    <select
                      value={student}
                      onChange={(e) => {
                        setStudent(e.target.value);
                        setActiveTab("overview");
                      }}
                    >
                      {data.children.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => setPreviewTools(false)}>
                      選択欄を隠す
                    </button>
                  </aside>
                ) : (
                  <button
                    className="parent-preview-restore"
                    onClick={() => setPreviewTools(true)}
                  >
                    生徒を変更
                  </button>
                )
              ) : (
                <nav className="parent-child-switch">
                  {data.children.map((item) => (
                    <button
                      key={item.key}
                      className={student === item.key ? "active" : ""}
                      onClick={() => {
                        setStudent(item.key);
                        setActiveTab("overview");
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </nav>
              )}
              <nav
                className="parent-tabs"
                role="tablist"
                aria-label="保護者メニュー"
              >
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    aria-controls={`parent-panel-${id}`}
                    onClick={() => openTab(id)}
                  >
                    {label}
                    {id === "overview" &&
                    portal &&
                    unreadAnnouncementCount(filterPortal(portal, child)) > 0 ? (
                      <b>{unreadAnnouncementCount(filterPortal(portal, child))}</b>
                    ) : (
                      ""
                    )}
                  </button>
                ))}
              </nav>
              <div
                id="parent-panel-overview"
                role="tabpanel"
                className="parent-tab-panel"
                hidden={activeTab !== "overview"}
              >
                <ParentOverview
                  child={child}
                  lessons={lessons}
                  portal={portal}
                  report={report}
                  submission={
                    data.submissionStatus?.[
                      child?.key?.replace(/^(user|elementary)_/, "")
                    ]
                  }
                  busy={busy}
                  onRead={() => setNewsVersion((value) => value + 1)}
                />
              </div>
              <div
                id="parent-panel-lessons"
                role="tabpanel"
                className="parent-tab-panel"
                hidden={activeTab !== "lessons"}
              >
                <LessonRecords
                  child={child}
                  lessons={lessons}
                  busy={busy || moreBusy}
                  more={more}
                />
              </div>
              <div
                id="parent-panel-report"
                role="tabpanel"
                className="parent-tab-panel"
                hidden={activeTab !== "report"}
              >
                <TermReport
                  child={child}
                  report={report}
                  term={term}
                  setTerm={setTerm}
                  busy={busy || reportBusy}
                />
                {Number(child?.grade) >= 7 && (
                  <SchoolComparisons
                    items={report?.schoolComparisons || []}
                    target={report?.targetSchool}
                    status={report?.judgementStatus}
                  />
                )}
              </div>
              {Number(child?.grade) >= 7 && (
                <div
                  id="parent-panel-scores"
                  role="tabpanel"
                  className="parent-tab-panel"
                  hidden={activeTab !== "scores"}
                >
                  <ParentScoreEntry
                    key={`${student}:${term}`}
                    child={child}
                    report={report}
                    term={term}
                    setTerm={setTerm}
                    busy={busy || reportBusy}
                    saved={() => setReportVersion((value) => value + 1)}
                  />
                </div>
              )}
              {parentTarget && (
                <div
                  id="parent-panel-services"
                  role="tabpanel"
                  className="parent-tab-panel"
                  hidden={activeTab !== "services"}
                >
                  <ParentServices child={child} />
                  <ReferralPanel child={child} />
                </div>
              )}
              <div
                id="parent-panel-calendar"
                role="tabpanel"
                className="parent-tab-panel"
                hidden={activeTab !== "calendar"}
              >
                <ParentCalendar portal={portal} />
              </div>
              <div
                id="parent-panel-documents"
                role="tabpanel"
                className="parent-tab-panel"
                hidden={activeTab !== "documents"}
              >
                <ParentDocuments
                  portal={portal}
                  child={child}
                />
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}

const homeworkStatus = {
  submitted: "すべて提出",
  partial: "一部未完了",
  missed: "未提出",
  absent: "欠席・未確認",
  none: "確認済み（宿題判定なし）",
  laterCompleted: "後日完了",
};
const readKey = () =>
  `parent-portal-read:${auth.currentUser?.uid || "signed-out"}`;
const unreadCount = (portal) => {
  let read = [];
  if (typeof window !== "undefined")
    try {
      read = JSON.parse(localStorage.getItem(readKey()) || "[]");
    } catch {}
  return [
    ...(portal?.announcements || []),
    ...(portal?.documents || []),
  ].filter((item) => !read.includes(item.id)).length;
};
const unreadAnnouncementCount = (portal) => {
  let read = [];
  if (typeof window !== "undefined") try { read = JSON.parse(localStorage.getItem(readKey()) || "[]"); } catch {}
  return (portal?.announcements || []).filter((item) => !read.includes(item.id)).length;
};
const filterPortal = (portal, child) => {
  const visible = (item) =>
    item.targetType === "all" ||
    !item.targetType ||
    item.targetType === "parentTag" ||
    item.targetType === "school" ||
    (item.targetType === "elementary" && Number(child?.grade) <= 6) ||
    (item.targetType === "middle" &&
      Number(child?.grade) >= 7 &&
      Number(child?.grade) <= 9) ||
    (item.targetType === "grade" &&
      String(child?.grade) === String(item.targetValue)) ||
    (item.targetType === "student" &&
      String(item.targetValue)
        .split(",")
        .map((value) => value.trim())
        .some(
          (value) =>
            value === child?.key || value === child?.key?.replace(/^user_/, ""),
        ));
  return {
    ...portal,
    announcements: (portal?.announcements || []).filter(visible),
    documents: (portal?.documents || []).filter(visible),
  };
};
function ParentOverview({ child, lessons, portal, report, submission, busy, onRead }) {
  portal = filterPortal(portal, child);
  const homework = lessons?.homework || [],
    pending = homework
      .filter(
        (item) =>
          !item.review || ["pending", "absent"].includes(item.review.status),
      )
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")),
    unread = portal ? unreadAnnouncementCount(portal) : 0;
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
    }).format(new Date()),
    nextDate = (portal?.calendarEvents || [])
      .filter(
        (item) =>
          ["lesson", "makeup", "course"].includes(item.type) &&
          item.startDate >= today,
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]?.startDate;
  const missingItems = (submission?.items || []).filter(
      (item) => item.status === "missing",
    ),
    scoreMissing = Number(child?.grade) >= 7 && missingItems.length > 0,
    actions = portal?.actionItems || [],
    allClear =
      !busy &&
      Boolean(lessons && portal) &&
      !scoreMissing &&
      !pending.length &&
      !unread &&
      !actions.length;
  const latestScore = report?.scores?.[0],
    nextHomework = pending[0],
    days = (value) =>
      Math.max(
        0,
        Math.ceil(
          (new Date(`${value}T00:00:00+09:00`).getTime() - Date.now()) /
            86400000,
        ),
      );
  return (
    <section className="parent-overview">
      <div className="parent-section-heading">
        <div>
          <small>HOME</small>
          <h2>お知らせ</h2>
        </div>
      </div>
      <div className="parent-action-list" hidden>
        {actions.map((item) => (
          <a className="score-bring-alert" href="#services" key={item.id}>
            <strong>{item.title}</strong>
            <p>
              {item.message}
              {item.deadline &&
                ` 締切：${item.deadline.replaceAll("-", " / ")}`}
            </p>
            <span>未対応・確認する →</span>
          </a>
        ))}
        {scoreMissing && (
          <a className="score-bring-alert" href="#scores">
            <strong>成績資料の提出をお願いします</strong>
            <p>
              {missingItems
                .slice(0, 3)
                .map((item) =>
                  item.kind === "exam" ? item.testType : "通知表",
                )
                .join("・")}
              {missingItems.length > 3
                ? `ほか${missingItems.length - 3}件`
                : ""}
              が未提出です。
            </p>
            <span>確認する →</span>
          </a>
        )}
        {unread > 0 && (
          <a className="score-bring-alert info" href="#announcements">
            <strong>未読のお知らせがあります</strong>
            <p>{unread}件のお知らせをご確認ください。</p>
            <span>下のお知らせを確認する ↓</span>
          </a>
        )}
      </div>
      {busy && !lessons ? (
        <p>読み込み中…</p>
      ) : (
        <>
          <div className="parent-overview-grid" hidden>
            <a href="#calendar">
              <span>次回授業</span>
              <strong className="overview-date">
                {nextDate?.replaceAll("-", " / ") || "未設定"}
              </strong>
              <em>{nextDate ? "予定を確認 →" : "教室へご確認ください"}</em>
            </a>
            <a href="#announcements">
              <span>未読のお知らせ</span>
              <strong>
                {unread}
                <small>件</small>
              </strong>
              <em>お知らせを見る →</em>
            </a>
          </div>
          <ParentAnnouncements portal={portal} child={child} onRead={onRead} />
          {false && nextHomework && (
            <article className="parent-next-homework">
              <header>
                <div>
                  <small>NEXT HOMEWORK</small>
                  <h3>次回までの宿題</h3>
                </div>
                <strong>
                  確認 {nextHomework.dueDate?.replaceAll("-", " / ")}
                </strong>
              </header>
              {nextHomework.items.map((item) => (
                <p key={item.id}>
                  <b>{item.materialLabel}</b>
                  <span>{item.range}</span>
                </p>
              ))}
            </article>
          )}
          {false && Number(child?.grade) >= 7 && latestScore && (
            <article className="parent-latest-score">
              <span>最近の成績</span>
              <strong>
                {latestScore.type === "exam" ? latestScore.testType : "通知表"}
                　{latestScore.total}点
              </strong>
              <a href="#report">学期レポートで確認 →</a>
            </article>
          )}
          {false && Number(child?.grade) === 9 && (
            <div className="parent-exam-overview">
              {(report?.entranceExams || []).map((item) => (
                <article key={item.id}>
                  <span>{item.label}まで</span>
                  <strong>
                    {days(item.date)}
                    <small>日</small>
                  </strong>
                  <time>{item.date.replaceAll("-", " / ")}</time>
                </article>
              ))}
              {report?.targetSchool && (
                <article>
                  <span>志望校</span>
                  <strong className="target-school">
                    {report.targetSchool}
                  </strong>
                  <small>
                    {report.latestJudgement
                      ? `最新判定：${report.latestJudgement.label}`
                      : "判定に必要な成績を確認中"}
                  </small>
                </article>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ParentCalendar({ portal }) {
  const dates = portal?.teachingDates || [],
    events = portal?.calendarEvents || [],
    today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
      new Date(),
    ),
    monthNow = today.slice(0, 7),
    months = [
      ...new Set(
        [
          ...dates.map((date) => date.slice(0, 7)),
          ...events.flatMap((item) => [
            item.startDate?.slice(0, 7),
            item.endDate?.slice(0, 7),
          ]),
        ].filter(Boolean),
      ),
    ].sort();
  const [selected, setSelected] = useState(monthNow),
    [selectedDate, setSelectedDate] = useState(today),
    month = months.includes(selected) ? selected : months[0],
    index = months.indexOf(month),
    group = (type) =>
      ["lesson", "makeup"].includes(type)
        ? "lesson"
        : type === "course"
          ? "course"
          : ["school", "exam"].includes(type)
            ? "school"
            : type === "interview"
              ? "interview"
              : "classroom",
    onDate = (date) =>
      events.filter(
        (item) =>
          item.startDate <= date && (item.endDate || item.startDate) >= date,
      ),
    upcoming = events
      .filter((item) => (item.endDate || item.startDate) >= today)
      .slice(0, 6);
  useEffect(() => {
    if (month && !selectedDate.startsWith(month))
      setSelectedDate(`${month}-01`);
  }, [month, selectedDate]);
  return (
    <section>
      <div className="parent-section-heading">
        <div>
          <small>SCHEDULE</small>
          <h2>予定カレンダー</h2>
        </div>
        <span>{portal?.year}年度</span>
      </div>
      {month ? (
        <>
          <nav className="parent-month-controls">
            <button
              disabled={index <= 0}
              onClick={() => setSelected(months[index - 1])}
              aria-label="前の月"
            >
              ‹
            </button>
            <select
              aria-label="表示する月"
              value={month}
              onChange={(e) => setSelected(e.target.value)}
            >
              {months.map((value) => (
                <option key={value} value={value}>
                  {value.replace("-", "年 ")}月
                </option>
              ))}
            </select>
            <button
              disabled={index >= months.length - 1}
              onClick={() => setSelected(months[index + 1])}
              aria-label="次の月"
            >
              ›
            </button>
          </nav>
          <div className="parent-calendar compact">
            <CalendarMonth
              month={month}
              teaching={new Set(dates)}
              events={events}
              selected={selectedDate}
              onSelect={setSelectedDate}
            />
          </div>
          <div className="parent-calendar-legend">
            <span className="lesson">通常授業</span>
            <span className="course">講習授業</span>
            <span className="school">学校行事</span>
            <span className="classroom">教室行事</span>
            <span className="interview">面談</span>
          </div>
          <div className="parent-day-detail">
            <h3>{selectedDate.replaceAll("-", " / ")} の予定</h3>
            {!onDate(selectedDate).length ? (
              <p>この日の予定はありません。</p>
            ) : (
              onDate(selectedDate).map((item) => (
                <article key={item.id}>
                  <i className={group(item.type)} />
                  <div>
                    <strong>{item.name}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </div>
                  <time>
                    {item.startTime || ""}
                    {item.endTime ? `〜${item.endTime}` : ""}
                  </time>
                </article>
              ))
            )}
          </div>
        </>
      ) : (
        <p>カレンダーはまだ公開されていません。</p>
      )}
      <div className="parent-upcoming">
        <h3>今後の予定</h3>
        {!upcoming.length ? (
          <p>現在、今後の予定はありません。</p>
        ) : (
          upcoming.map((item) => (
            <article key={item.id}>
              <time>{item.startDate.replaceAll("-", " / ")}</time>
              <strong>{item.name}</strong>
              <span>{item.detail || ""}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
function CalendarMonth({ month, teaching, events, selected, onSelect }) {
  const [year, value] = month.split("-").map(Number),
    first = new Date(year, value - 1, 1).getDay(),
    count = new Date(year, value, 0).getDate(),
    group = (type) =>
      ["lesson", "makeup"].includes(type)
        ? "lesson"
        : type === "course"
          ? "course"
          : ["school", "exam"].includes(type)
            ? "school"
            : type === "interview"
              ? "interview"
              : "classroom";
  return (
    <article>
      <h3>{value}月</h3>
      <div className="calendar-week">
        {"日月火水木金土".split("").map((day) => (
          <b key={day}>{day}</b>
        ))}
      </div>
      <div>
        {Array.from({ length: first }, (_, i) => (
          <i key={`empty-${i}`} />
        ))}
        {Array.from({ length: count }, (_, index) => {
          const day = index + 1,
            id = `${year}-${String(value).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
            items = events.filter(
              (item) =>
                item.startDate <= id && (item.endDate || item.startDate) >= id,
            );
          return (
            <button
              type="button"
              className={`${teaching.has(id) ? "open " : ""}${selected === id ? "selected" : ""}`}
              key={id}
              onClick={() => onSelect(id)}
            >
              <time dateTime={id}>{day}</time>
              <span>
                {[...new Set(items.map((item) => group(item.type)))]
                  .slice(0, 3)
                  .map((type) => (
                    <i className={type} key={type} />
                  ))}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}
function ParentAnnouncements({ portal, child, onRead }) {
  portal = filterPortal(portal, child);
  const announcements = [...(portal?.announcements || [])].sort((a, b) => {
    const order = { important: 0, request: 1, normal: 2 };
    return (order[a.priority] ?? 2) - (order[b.priority] ?? 2) || b.date.localeCompare(a.date);
  });
  const markRead = () => {
    try {
      const before = JSON.parse(localStorage.getItem(readKey()) || "[]");
      localStorage.setItem(readKey(), JSON.stringify([...new Set([...before, ...announcements.map((item) => item.id)])]));
      onRead?.();
    } catch {}
  };
  return <section id="announcements" className="parent-announcements"><div className="parent-section-heading"><div><small>INFORMATION</small><h2>教室からのお知らせ</h2></div>{announcements.length > 0 && <button type="button" onClick={markRead}>表示中を既読にする</button>}</div><div className="parent-news">{announcements.length === 0 ? <p>現在のお知らせはありません。</p> : announcements.map((item) => <article className={`priority-${item.priority}`} key={item.id}><time>{item.date}</time><strong>{item.priority === "important" ? "重要｜" : item.priority === "request" ? "対応依頼｜" : ""}{item.title}</strong><p>{item.body}</p></article>)}</div></section>;
}

function ParentDocuments({ portal, child }) {
  const [documentError, setDocumentError] = useState("");
  portal = filterPortal(portal, child);
  const order = { important: 0, request: 1, normal: 2 },
    sort = (items) =>
      [...(items || [])].sort(
        (a, b) =>
          (order[a.priority] ?? 2) - (order[b.priority] ?? 2) ||
          b.date.localeCompare(a.date),
      ),
    groups = [
      ...sort(portal?.documents).reduce((map, item) => {
        const key = item.category || "その他";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
        return map;
      }, new Map()),
    ];
  const openDocument = async (event, item) => {
    if (!item.localFile) return;
    event.preventDefault();
    const tab = window.open("", "_blank");
    setDocumentError("");
    try {
      const token = await auth.currentUser?.getIdToken(),
        response = await fetch(
          `/api/parent/documents/${encodeURIComponent(item.id)}?student=${encodeURIComponent(child.key)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      if (!response.ok)
        throw new Error("資料を開けませんでした。再度お試しください。");
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      tab?.close();
      setDocumentError(error.message);
    }
  };
  const documentLink = (item) => (
    <a
      className={`priority-${item.priority}`}
      key={item.id}
      href={item.localFile ? "#documents" : item.url}
      onClick={(event) => openDocument(event, item)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>
        <time>{item.date}</time>
        <strong>
          {item.priority === "important"
            ? "重要｜"
            : item.priority === "request"
              ? "確認依頼｜"
              : ""}
          {item.title}
        </strong>
        <small>{item.body}</small>
      </span>
      <b>PDFを開く ↗</b>
    </a>
  );
  return (
    <section>
      <div className="parent-section-heading">
        <div>
          <small>DOCUMENTS</small>
          <h2>資料</h2>
        </div>
      </div>
      <div className="parent-news">
        {documentError && <p role="alert">{documentError}</p>}
        {!groups.length ? (
          <p>公開中の資料はありません。</p>
        ) : (
          <div className="parent-document-groups">
            {groups.map(([category, items], index) => (
              <details key={category} open={index === 0}>
                <summary>
                  {category}
                  <small>{items.length}件</small>
                </summary>
                <div>{items.map(documentLink)}</div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ParentScoreEntry({ child, report, term, setTerm, busy, saved }) {
  const blankExam = () =>
      Object.fromEntries(SUBJECTS.map((subject) => [subject, ""])),
    subSubjects = ["音楽", "美術", "保体", "技家"];
  const [type, setType] = useState("exam"),
    [testType, setTestType] = useState("中間"),
    [gradePercentile,setGradePercentile]=useState(''),
    [exam, setExam] = useState(blankExam),
    [main, setMain] = useState(() =>
      Object.fromEntries(SUBJECTS.map((subject) => [subject, 3])),
    ),
    [sub, setSub] = useState(() =>
      Object.fromEntries(subSubjects.map((subject) => [subject, 3])),
    ),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false);
  const selected = report?.terms?.find((item) => item.id === term),
    scores = report?.scores || [],
    submissionItems = report?.submissionStatus?.items || [],
    examSubmitted = report?.submissionStatus?.examReceived === true,
    internalSubmitted = report?.submissionStatus?.internalReceived === true;
  const submit = async () => {
    if (!selected || saving || busy || !report?.summary) return;
    setSaving(true);
    setNotice("");
    try {
      const payload =
        type === "exam"
          ? {
              type,
              student: child.key,
              year: String(selected.year),
              term: `${selected.term}学期`,
              testType,
              exam,
              gradePercentile,
            }
          : {
              type,
              student: child.key,
              year: String(selected.year),
              term: `${selected.term}学期`,
              internalMain: main,
              internalSub: sub,
            };
      await parentApi("/api/parent/scores", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setNotice("成績を保存しました。教室でも同じデータを確認できます。");
      saved();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section>
      <div className="parent-section-heading">
        <div>
          <small>SCORE SUBMISSION</small>
          <h2>{child?.name}さんの成績提出</h2>
        </div>
        <select value={term} onChange={(e) => setTerm(e.target.value)}>
          {(report?.terms || []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.year}年度 {item.term}学期
            </option>
          ))}
        </select>
      </div>
      {!report?.summary ? (
        <p>
          {busy
            ? "提出状況を確認しています…"
            : "提出状況を取得できませんでした。ページを再読み込みしてください。"}
        </p>
      ) : (
        <>
          <div className="parent-score-submission-list">
            {submissionItems.length ? (
              submissionItems.map((item) => (
                <article key={item.id} className={item.status}>
                  <div>
                    <strong>
                      {item.kind === "exam" ? item.testType : "通知表"}
                    </strong>
                    <small>提出予定 {item.date.replaceAll("-", " / ")}</small>
                  </div>
                  <b>
                    {["received", "legacy"].includes(item.status)
                      ? "提出済み"
                      : item.status === "upcoming"
                        ? "提出予定"
                        : "未提出"}
                  </b>
                </article>
              ))
            ) : (
              <p>この学期の提出予定はまだ登録されていません。</p>
            )}
          </div>
          <div className="score-submission-status">
            <article className={examSubmitted ? "done" : "waiting"}>
              <span>テスト資料</span>
              <strong>{examSubmitted ? "確認済み" : "未提出あり"}</strong>
              <small>
                {scores.filter((item) => item.type === "exam").length}
                件の成績データ
              </small>
            </article>
            <article className={internalSubmitted ? "done" : "waiting"}>
              <span>通知表</span>
              <strong>{internalSubmitted ? "確認済み" : "未提出あり"}</strong>
              <small>{selected?.term}学期の提出状況</small>
            </article>
          </div>
          <div className="parent-score-form">
            <nav>
              <button
                className={type === "exam" ? "active" : ""}
                onClick={() => setType("exam")}
              >
                テストを入力
              </button>
              <button
                className={type === "internal" ? "active" : ""}
                onClick={() => setType("internal")}
              >
                通知表を入力
              </button>
            </nav>
            {type === "exam" ? (
              <>
                <label>
                  テスト名
                  <select
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                  >
                    {SCORE_TEST_TYPES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <div className="parent-score-fields">
                  {SUBJECTS.map((subject) => (
                    <label key={subject}>
                      {subject}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        inputMode="numeric"
                        value={exam[subject]}
                        onChange={(e) =>
                          setExam((old) => ({
                            ...old,
                            [subject]: e.target.value,
                          }))
                        }
                      />
                      <small>/ 100</small>
                    </label>
                  ))}
                </div>
                <label>5計％（任意）<input type="number" min="0.1" max="99.9" step="0.1" inputMode="decimal" value={gradePercentile} onChange={event=>setGradePercentile(event.target.value)} placeholder="例：10"/><small>{gradePercentile?`校内推定偏差値 ${schoolDeviationFromTopPercent(gradePercentile)??'入力値を確認'}`:'入力すると校内推定偏差値を算出します'}</small></label>
              </>
            ) : (
              <>
                <p>通知表の評定（1〜5）を入力してください。</p>
                <div className="parent-score-fields internal">
                  {[...SUBJECTS, ...subSubjects].map((subject) => (
                    <label key={subject}>
                      {subject}
                      <select
                        value={
                          (SUBJECTS.includes(subject) ? main : sub)[subject]
                        }
                        onChange={(e) =>
                          (SUBJECTS.includes(subject) ? setMain : setSub)(
                            (old) => ({
                              ...old,
                              [subject]: Number(e.target.value),
                            }),
                          )
                        }
                      >
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}{" "}
            {notice && (
              <p className="score-entry-notice" role="status">
                {notice}
              </p>
            )}
            <button
              className="score-entry-save"
              disabled={saving || busy || !selected || !report?.summary}
              onClick={submit}
            >
              {saving ? "保存中…" : "この成績を保存"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function HomeworkRecords({ child, homework, busy }) {
  const itemLabel = { submitted: "提出", partial: "途中", missed: "未提出" };
  const groups = [
    [
      "attention",
      "未提出・途中",
      (homework || []).filter(
        (item) =>
          ["partial", "missed"].includes(item.review?.status) &&
          item.laterCompletion?.status !== "laterCompleted",
      ),
    ],
    [
      "next",
      "次回までの宿題",
      (homework || []).filter(
        (item) =>
          !item.review || ["pending", "absent"].includes(item.review.status),
      ),
    ],
    [
      "done",
      "確認済み",
      (homework || []).filter(
        (item) =>
          ["submitted", "none"].includes(item.review?.status) ||
          item.laterCompletion?.status === "laterCompleted",
      ),
    ],
  ];
  const card = (item) => {
    const results = item.review?.itemResults || {};
    return (
      <article
        key={item.id}
        className={
          !item.review || ["pending", "absent"].includes(item.review.status)
            ? "pending"
            : ""
        }
      >
        <header>
          <div>
            <small>指示日 {item.assignedDate || "—"}</small>
            <strong>確認予定 {item.dueDate || "未設定"}</strong>
          </div>
          <span>
            {homeworkStatus[
              item.laterCompletion?.status || item.review?.status
            ] || "確認待ち"}
          </span>
        </header>
        <div>
          {(item.items || []).map((row) => (
            <p key={row.id}>
              <strong>{row.materialLabel}</strong>
              <span>{row.range}</span>
              {results[row.id] && (
                <b className={`homework-item-${results[row.id]}`}>
                  {itemLabel[results[row.id]]}
                </b>
              )}
            </p>
          ))}
        </div>
      </article>
    );
  };
  return (
    <section>
      <div className="parent-section-heading">
        <div>
          <small>HOMEWORK</small>
          <h2>{child?.name}さんの宿題</h2>
        </div>
        <span>状況別</span>
      </div>
      {busy && !homework ? (
        <p>読み込み中…</p>
      ) : homework && !homework.length ? (
        <p>公開された宿題はまだありません。</p>
      ) : (
        <div className="parent-homework-groups">
          {groups
            .filter(([, , items]) => items.length)
            .map(([id, title, items]) => (
              <details
                key={id}
                open={id !== "done"}
                className={`homework-group ${id}`}
              >
                <summary>
                  {title}
                  <small>{items.length}件</small>
                </summary>
                <div className="parent-homework-list">{items.map(card)}</div>
              </details>
            ))}
        </div>
      )}
    </section>
  );
}

function LessonRecords({ child, lessons, busy, more }) {
  const groups = [
    ...(lessons?.lessons || []).reduce((map, item) => {
      const month = item.date.slice(0, 7);
      if (!map.has(month)) map.set(month, []);
      map.get(month).push(item);
      return map;
    }, new Map()),
  ];
  return (
    <section>
      <div className="parent-section-heading">
        <div>
          <small>LESSON RECORDS</small>
          <h2>{child?.name}さんの授業日の記録</h2>
        </div>
        <span>月ごと・新しい順</span>
      </div>
      {busy && !lessons && <p>読み込み中…</p>}
      {lessons && !lessons.lessons.length && (
        <p>公開された授業記録はまだありません。</p>
      )}
      <div className="parent-lesson-months">
        {groups.map(([month, items], index) => (
          <details key={month} open={index === 0}>
            <summary>
              {month.replace("-", "年 ")}月 <small>{items.length}件</small>
            </summary>
            <div className="parent-lessons">
              {items.map((item) => (
                <LessonCard key={item.date} item={item} />
              ))}
            </div>
          </details>
        ))}
      </div>
      {lessons?.next && (
        <button className="parent-more" disabled={busy} onClick={more}>
          {busy ? "読み込み中…" : "以前の授業記録を表示"}
        </button>
      )}
    </section>
  );
}
function LessonCard({ item }) {
  return (
    <article>
      <header>
        <div>
          <time>{item.date.replaceAll("-", " / ")}</time>
          <strong>{attendanceLabel[item.attendance] || "授業記録"}</strong>
        </div>
        <span>
          {item.termId ? item.termId.replace("_", "年度 第") + "学期" : ""}
        </span>
      </header>
      <div className="parent-statuses">
        {item.late && <span>遅刻</span>}
        {item.forgot && <span>忘れ物</span>}
        {item.wordTest &&
          ["completed", "makeup"].includes(item.wordTest.status) && (
            <span>
              単語テスト {item.wordTest.correct}/{item.wordTest.total}
            </span>
          )}
      </div>
      {item.learningContent && (
        <div className="parent-record-block">
          <h3>学習内容</h3>
          <p>{item.learningContent}</p>
        </div>
      )}
      {item.assignedHomework.length > 0 && (
        <div className="parent-record-block current">
          <h3>今回出された宿題</h3>
          {item.assignedHomework.map((homework) => (
            <div key={homework.id}>
              <p>確認予定日：{homework.dueDate}</p>
              {homework.items.map((row) => (
                <small key={row.id}>
                  {row.materialLabel}：{row.range}
                </small>
              ))}
            </div>
          ))}
        </div>
      )}
      {item.lessonReport?.text ? (
        <div className="parent-record-block comment">
          <h3>授業の様子</h3>
          <p>{item.lessonReport.text}</p>
        </div>
      ) : (
        item.comments.length > 0 && (
          <div className="parent-record-block comment">
            <h3>授業の様子</h3>
            {item.comments.map((comment) => (
              <p key={comment.id}>{comment.text}</p>
            ))}
          </div>
        )
      )}
    </article>
  );
}

function TermReport({ child, report, term, setTerm, busy }) {
  const summary = report?.summary,
    middle = Number(child?.grade) >= 7;
  return (
    <section>
      <div className="parent-section-heading">
        <div>
          <small>TERM REPORT</small>
          <h2>{child?.name}さんの学期レポート</h2>
        </div>
        <select value={term} onChange={(e) => setTerm(e.target.value)}>
          {(report?.terms || []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.year}年度 {item.term}学期
            </option>
          ))}
        </select>
      </div>
      {busy && !summary ? (
        <p>集計中…</p>
      ) : (
        summary && (
          <>
            <div className="parent-summary-grid">
              {middle && (
                <Summary
                  title="単語テスト平均"
                  value={summary.wordTest.rate}
                  unit="%"
                  note={`${summary.wordTest.count}回・${summary.wordTest.correct}/${summary.wordTest.total}問`}
                />
              )}
              <Summary
                title="授業記録"
                value={summary.lessons}
                unit="回"
                note={`出席 ${summary.attendance.present}／振替 ${summary.attendance.makeup}／欠席 ${summary.attendance.absent}`}
              />
              <Summary
                title="学習態度"
                value={summary.attendance.late + summary.forgot}
                unit="件"
                note={`遅刻 ${summary.attendance.late}／忘れ物 ${summary.forgot}`}
              />
            </div>
            {middle && (
              <>
                <h3 className="parent-score-title">成績・教科別比較</h3>
                {!report.scores.length ? (
                  <p>この学期の公開できる成績はありません。</p>
                ) : (
                  <div className="parent-scores">
                    {report.scores.map((score) => (
                      <article key={score.id}>
                        <header>
                          <strong>
                            {score.type === "exam" ? score.testType : "内申点"}
                          </strong>
                          <span>{score.total}点</span>
                        </header>
                        <div>
                          {score.type === "exam"
                            ? SUBJECTS.map((subject) => (
                                <span key={subject}>
                                  {subject}
                                  <strong>
                                    {score.subjects[subject] ?? "—"}
                                  </strong>
                                  <i
                                    style={{
                                      height: `${Math.min(100, Number(score.subjects[subject] || 0))}%`,
                                    }}
                                  />
                                </span>
                              ))
                            : [
                                ...Object.entries(score.main),
                                ...Object.entries(score.sub),
                              ].map(([subject, value]) => (
                                <span key={subject}>
                                  {subject}
                                  <strong>{value}</strong>
                                  <i
                                    style={{
                                      height: `${Math.min(100, (Number(value || 0) / 5) * 100)}%`,
                                    }}
                                  />
                                </span>
                              ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )
      )}
    </section>
  );
}
function Summary({ title, value, unit, note }) {
  return (
    <article>
      <span>{title}</span>
      <strong>
        {value ?? "—"}
        <small>{value === null ? "" : unit}</small>
      </strong>
      <p>{note}</p>
    </article>
  );
}
function SchoolComparisons({ items, target, status }) {
  if (!items.length)
    return (
      <section>
        <p className="parent-judge-empty">
          {status || '判定には追加情報が必要です。'}
        </p>
      </section>
    );
  return (
    <section className="parent-judge">
      <div className="parent-section-heading">
        <div>
          <small>SCHOOL GUIDE</small>
          <h2>志望校判定</h2>
        </div>
        <span>{items.length}校</span>
      </div>
      <div>
        {items.map((item) => (
          <article
            key={item.name}
            className={item.name === target ? "target" : ""}
          >
            <strong>{item.name}</strong>
            <span>{item.label}</span>
            <small>
              {item.difference >= 0 ? "+" : ""}
              {item.difference}点
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
