'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { SHIFT_PERIODS, shiftDateAt, shiftWeekStart } from '@/lib/weeklyShifts';
import './teacher-preferences.css';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const subjectNames = { japanese: '国語', math: '数学', english: '英語', science: '理科', social: '社会', other: 'その他' };
export default function TeacherPreferencesPage() {
  const [week, setWeek] = useState(shiftWeekStart(today())), [teachers, setTeachers] = useState([]), [notice, setNotice] = useState('');
  useEffect(() => onAuthStateChanged(auth, user => { if (user) user.getIdToken().then(token => fetch('/api/admin/teacher-preferences', { headers: { Authorization: `Bearer ${token}` } })).then(response => response.json()).then(value => { if (value.error) throw new Error(value.error); setTeachers(value.teachers || []); }).catch(error => setNotice(error.message)); }), []);
  return <main className="teacher-preferences-admin"><header><div><small>TEACHER AVAILABILITY</small><h1>講師のシフト希望</h1><p>希望日時・対応教科・学年を一覧で確認し、シフトの講師割当に利用します。</p></div><a href="/admin/shifts">シフトへ戻る</a></header>{notice && <p role="status">{notice}</p>}<nav><button onClick={() => setWeek(shiftDateAt(week, -7))}>← 前週</button><strong>{week}から</strong><button onClick={() => setWeek(shiftDateAt(week, 7))}>次週 →</button></nav><div className="teacher-pref-scroll"><table><thead><tr><th>講師</th><th>指導可能</th>{Array.from({ length: 6 }, (_, index) => <th key={index}>{shiftDateAt(week, index)}</th>)}</tr></thead><tbody>{teachers.map(teacher => <tr key={teacher.uid}><th>{teacher.name}</th><td>{(teacher.preferences.subjects || []).map(code => subjectNames[code] || code).join('・') || '未登録'}<br/>{(teacher.preferences.grades || []).map(value => value <= 6 ? `小${value}` : value <= 9 ? `中${value - 6}` : `高${value - 9}`).join('・') || '学年未登録'}</td>{Array.from({ length: 6 }, (_, index) => { const date = shiftDateAt(week, index), ids = teacher.preferences.availability?.[date] || []; return <td key={date}>{ids.map(id => SHIFT_PERIODS.find(item => item.id === id)?.startTime).filter(Boolean).join('、') || '—'}</td>; })}</tr>)}</tbody></table></div></main>;
}
