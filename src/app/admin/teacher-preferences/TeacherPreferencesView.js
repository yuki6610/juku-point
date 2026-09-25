'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { SHIFT_PERIODS, shiftDateAt, shiftWeekStart } from '@/lib/weeklyShifts';
import { TEACHER_LEVEL_NAMES, TEACHER_SUBJECTS } from '@/lib/teacherSubjects.mjs';
import './teacher-preferences.css';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const subjectNames = Object.fromEntries(Object.values(TEACHER_SUBJECTS).flat());
export default function TeacherPreferencesView({ selectedWeek, onWeekChange = () => {} }) {
  const [localWeek, setLocalWeek] = useState(shiftWeekStart(today())), [teachers, setTeachers] = useState([]), [notice, setNotice] = useState('');
  const week = selectedWeek || localWeek;
  const setWeek = value => { setLocalWeek(value); onWeekChange(value); };
  useEffect(() => onAuthStateChanged(auth, user => { if (user) user.getIdToken().then(token => fetch('/api/admin/teacher-preferences', { headers: { Authorization: `Bearer ${token}` } })).then(response => response.json()).then(value => { if (value.error) throw new Error(value.error); setTeachers(value.teachers || []); }).catch(error => setNotice(error.message)); }), []);
  return <main className="teacher-preferences-admin"><header><div><small>講師の希望</small><h1>講師のシフト希望</h1><p>希望日時と学年別の指導可能科目を確認し、上の「週シフト」タブで割り当てます。</p></div></header>{notice && <p role="status">{notice}</p>}<nav><button onClick={() => setWeek(shiftDateAt(week, -7))}>← 前週</button><strong>{week}から</strong><button onClick={() => setWeek(shiftDateAt(week, 7))}>次週 →</button></nav><div className="teacher-pref-scroll"><table><thead><tr><th>講師</th><th>指導可能</th>{Array.from({ length: 6 }, (_, index) => <th key={index}>{shiftDateAt(week, index)}</th>)}</tr></thead><tbody>{teachers.map(teacher => <tr key={teacher.uid}><th>{teacher.name}</th><td>{Object.entries(TEACHER_LEVEL_NAMES).map(([level, label]) => <div key={level}><strong>{label}：</strong>{(teacher.preferences.subjectsByLevel?.[level] || []).map(code => subjectNames[code] || code).join('・') || '未登録'}</div>)}</td>{Array.from({ length: 6 }, (_, index) => { const date = shiftDateAt(week, index), ids = teacher.preferences.availability?.[date] || []; return <td key={date}>{ids.map(id => SHIFT_PERIODS.find(item => item.id === id)?.startTime).filter(Boolean).join('、') || '—'}</td>; })}</tr>)}</tbody></table></div></main>;
}
