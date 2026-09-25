'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { shiftDateAt, shiftWeekStart } from '@/lib/weeklyShifts';
import { TEACHER_LEVEL_NAMES, TEACHER_SUBJECTS, emptyTeacherSubjects } from '@/lib/teacherSubjects.mjs';
import './shift-preferences.css';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const weekdayNames = ['月', '火', '水', '木', '金', '土'];

export default function ShiftPreferences() {
  const [week, setWeek] = useState(shiftWeekStart(today()));
  const [periods, setPeriods] = useState([]);
  const [subjectsByLevel, setSubjectsByLevel] = useState(emptyTeacherSubjects);
  const [subjectsConfigured, setSubjectsConfigured] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(true);
  const [availability, setAvailability] = useState({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user) return;
      user.getIdToken().then(token => fetch('/api/teacher/shift-preferences', { headers: { Authorization: `Bearer ${token}` } })).then(response => response.json()).then(value => {
        if (!active) return;
        if (value.error) throw new Error(value.error);
        setPeriods(value.periods || []);
        setSubjectsByLevel({ ...emptyTeacherSubjects(), ...value.preferences?.subjectsByLevel });
        setSubjectsConfigured(value.preferences?.subjectsConfigured === true);
        setSubjectsOpen(value.preferences?.subjectsConfigured !== true);
        setAvailability(value.preferences?.availability || {});
      }).catch(error => { if (active) setNotice(error.message); });
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  const toggleSubject = (level, code) => setSubjectsByLevel(old => {
    const values = old[level] || [];
    return { ...old, [level]: values.includes(code) ? values.filter(value => value !== code) : [...values, code] };
  });
  const toggleSlot = (date, id) => setAvailability(old => {
    const values = old[date] || [];
    return { ...old, [date]: values.includes(id) ? values.filter(value => value !== id) : [...values, id] };
  });
  const save = async action => {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/teacher/shift-preferences', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'subjects' ? { action, subjectsByLevel } : { action, availability }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === 'subjects') { setSubjectsConfigured(true); setSubjectsOpen(false); }
      setNotice(action === 'subjects' ? '指導可能科目を保存しました。' : 'シフト希望を保存しました。担当講師の割当は管理者が行います。');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  return <section className="teacher-shift-preferences">
    <h2>シフト希望</h2><p>出勤可能な日時を登録してください。</p>{notice && <p role="status">{notice}</p>}
    <h3>シフト希望表</h3>
    <div className="shift-week-nav"><button onClick={() => setWeek(shiftDateAt(week, -7))}>← 前週</button><strong>{week}から</strong><button onClick={() => setWeek(shiftDateAt(week, 7))}>次週 →</button></div>
    <div className="shift-availability-grid"><div className="shift-grid-head">時間</div>{weekdayNames.map((label, index) => <div className="shift-grid-head" key={label}>{shiftDateAt(week, index)}（{label}）</div>)}{periods.map(period => <div className="shift-grid-row" key={period.id}><strong>{period.startTime}〜{period.endTime}</strong>{weekdayNames.map((_, index) => { const date = shiftDateAt(week, index); return <label key={date}><input type="checkbox" checked={(availability[date] || []).includes(period.id)} onChange={() => toggleSlot(date, period.id)}/><span>出勤可</span></label>; })}</div>)}</div>
    <button className="shift-preferences-save" disabled={busy} onClick={() => save('availability')}>{busy ? '保存中…' : 'シフト希望を保存'}</button>
    <section className="teacher-subject-section"><button type="button" className="teacher-subject-toggle" aria-expanded={subjectsOpen} onClick={() => setSubjectsOpen(value => !value)}>指導可能科目 {subjectsConfigured ? '（登録済み・変更するには開く）' : '（未登録）'} {subjectsOpen ? '▲' : '▼'}</button>
      {subjectsOpen && <div>{Object.entries(TEACHER_SUBJECTS).map(([level, options]) => <div key={level}><h4>{TEACHER_LEVEL_NAMES[level]}</h4><div className="shift-option-row">{options.map(([code, label]) => <label key={code}><input type="checkbox" checked={(subjectsByLevel[level] || []).includes(code)} onChange={() => toggleSubject(level, code)}/>{label}</label>)}</div></div>)}<button className="shift-preferences-save" disabled={busy} onClick={() => save('subjects')}>{busy ? '保存中…' : '指導可能科目を保存'}</button></div>}
    </section>
  </section>;
}
