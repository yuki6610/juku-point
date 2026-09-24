'use client';
import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { shiftDateAt, shiftWeekStart } from '@/lib/weeklyShifts';
import './shifts.css';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const subjects = [['', '教科未設定'], ['japanese', '国語'], ['math', '数学'], ['english', '英語'], ['science', '理科'], ['social', '社会'], ['other', 'その他']];
const weekdayNames = ['月', '火', '水', '木', '金', '土'];

export default function ShiftsView({ selectedWeek, onWeekChange = () => {} }) {
  const [localWeek, setLocalWeek] = useState(shiftWeekStart(today())), [data, setData] = useState(null), [entries, setEntries] = useState([]), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [studentToAdd, setStudentToAdd] = useState('');
  const week = selectedWeek || localWeek;
  const setWeek = value => { setLocalWeek(value); onWeekChange(value); };
  const call = async (body, selectedWeek = week) => {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch(`/api/admin/shifts?week=${selectedWeek}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify({ ...body, week: selectedWeek }) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '通信に失敗しました。');
    return result;
  };
  const load = async selectedWeek => { setNotice(''); try { const result = await call(null, selectedWeek); setData(result); setEntries(result.week?.entries || []); } catch (error) { setNotice(error.message); } };
  useEffect(() => { setData(null); setEntries([]); return onAuthStateChanged(auth, user => { if (user) load(week); }); }, [week]);
  const action = async body => { if (data?.week && body.action !== 'save' && JSON.stringify(entries) !== JSON.stringify(data.week.entries || [])) { setNotice('表の変更を先に保存してください。'); return; } setBusy(true); try { const result = await call(body); await load(week); setNotice(`保存しました。${result.count == null ? '' : ` ${result.count}件反映`}${result.skipped ? `／重複などで${result.skipped}件保留` : ''}${result.unmapped ? `／時刻が固定枠と一致しない${result.unmapped}件は未反映です。確認して手動で追加してください。` : ''}`); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const changeWeek = offset => setWeek(shiftDateAt(week, offset * 7));
  const edit = (id, values) => setEntries(old => old.map(item => item.id === id ? { ...item, ...values } : item));
  const studentNames = useMemo(() => new Map((data?.students || []).map(item => [item.key, item.name])), [data]);
  const addRow = (date, periodId) => setEntries(old => [...old, { id: crypto.randomUUID(), date, periodId, studentKey: '', subject: '', subjectCode: '', teacherUid: '', lessonType: 'regular', sourceId: '' }]);
  const currentPrograms = data?.programs || [];
  const visiblePeriods = (data?.periods || []).filter(period => !period.courseOnly || currentPrograms.length);
  const save = () => action({ action: 'save', entries });
  return <main className="shifts-page"><header className="shifts-header"><div><small>WEEKLY SHIFT</small><h1>講師シフト</h1><p>初週は通常授業から下書き作成。確定後、次週へコピーして調整します。</p></div><a href="/admin">管理画面へ戻る</a></header>
    <div className="shifts-toolbar"><button onClick={() => changeWeek(-1)}>← 前週</button><label>週の月曜日<input type="date" value={week} onChange={event => { if (event.target.value) setWeek(shiftWeekStart(event.target.value)); }}/></label><button onClick={() => changeWeek(1)}>次週 →</button><strong>{data?.week?.status === 'confirmed' ? '確定済み' : data?.week ? '下書き' : '未作成'}</strong></div>
    {notice && <p className="shifts-notice" role="status">{notice}</p>}
    <div className="shifts-actions">
      {!data?.week && <><button disabled={busy} onClick={() => action({ action: 'initialize' })}>通常授業から最初の週を作成</button><button disabled={busy} onClick={() => action({ action: 'copy', sourceWeek: shiftDateAt(week, -7) })}>前週の確定シフトをコピー</button></>}
      {data?.week && <><button disabled={busy} onClick={save}>編集を保存</button><button disabled={busy} onClick={() => action({ action: 'importCourse' })}>確定した講習を反映</button><label>新規生徒を反映<select value={studentToAdd} onChange={event => setStudentToAdd(event.target.value)}><option value="">生徒を選択</option>{(data.students || []).map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label><button disabled={busy || !studentToAdd} onClick={() => action({ action: 'addStudent', studentKey: studentToAdd })}>この生徒を反映</button><button disabled={busy || data.week.status === 'confirmed'} onClick={() => action({ action: 'confirm' })}>シフトを確定</button></>}
      <a href="/admin/course-lessons">講習日程へ</a><a href="/admin/shift-management?tab=preferences">講師の希望を確認</a>
    </div>
    {data?.week && <div className="shifts-scroll"><table className="shifts-table"><thead><tr><th rowSpan="2">時間帯</th>{weekdayNames.map((label, day) => <th colSpan="3" key={label}>{shiftDateAt(week, day)}（{label}）</th>)}</tr><tr>{weekdayNames.flatMap(label => ['生徒名', '教科', '担当講師'].map((title, index) => <th key={`${label}-${index}`}>{title}</th>))}</tr></thead><tbody>{visiblePeriods.map(period => { const maxRows = Math.max(1, ...weekdayNames.map((_, day) => entries.filter(item => item.date === shiftDateAt(week, day) && item.periodId === period.id).length)); return Array.from({ length: maxRows }, (_, rowIndex) => <tr key={`${period.id}-${rowIndex}`} className={`shift-period-${period.id}`}>
      {rowIndex === 0 && <th rowSpan={maxRows}>{period.label}<small>{period.startTime}〜{period.endTime}</small></th>}
      {weekdayNames.flatMap((_, day) => {
        const date = shiftDateAt(week, day);
        const available = !period.courseOnly || currentPrograms.some(item => item.startDate <= date && date <= item.endDate);
        const item = entries.filter(row => row.date === date && row.periodId === period.id)[rowIndex];
        if (!available) return [<td key={`${date}-closed`} colSpan="3" className="shift-closed">—</td>];
        if (!item) return [<td key={`${date}-add`} colSpan="3"><button className="shift-add" onClick={() => addRow(date, period.id)}>＋ 追加</button></td>];
        const importedCourse = item.lessonType === 'course';
        return [
          <td key={`${item.id}-student`}>
            <select value={item.studentKey} disabled={importedCourse} onChange={event => edit(item.id, { studentKey: event.target.value })}><option value="">生徒を選択</option>{(data.students || []).map(student => <option key={student.key} value={student.key}>{student.name}</option>)}</select>
            {importedCourse ? <small>講習</small> : <><select aria-label="授業種別" value={item.lessonType} onChange={event => edit(item.id, { lessonType: event.target.value, sourceId: '' })}><option value="regular">通常</option><option value="makeup">振替</option></select>{item.lessonType === 'makeup' && <input aria-label="振替元の欠席日" type="date" value={item.sourceId || ''} onChange={event => edit(item.id, { sourceId: event.target.value })}/>}</>}
          </td>,
          <td key={`${item.id}-subject`}><select value={item.subjectCode || 'other'} onChange={event => { const code = event.target.value; edit(item.id, { subjectCode: code, subject: subjects.find(([value]) => value === code)?.[1] || '' }); }}>{subjects.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>{item.subjectCode === 'other' && <input aria-label="教科名" value={item.subject} onChange={event => edit(item.id, { subject: event.target.value })}/>}</td>,
          <td key={`${item.id}-teacher`}>
            <select value={item.teacherUid} onChange={event => edit(item.id, { teacherUid: event.target.value })}><option value="">未割当</option>{(data.teachers || []).map(teacher => <option key={teacher.uid} value={teacher.uid}>{teacher.name}{(teacher.availability?.[item.date] || []).includes(item.periodId) ? '・希望あり' : ''}</option>)}</select>
            <select aria-label="授業曜日" value={item.date} onChange={event => edit(item.id, { date: event.target.value })}>{weekdayNames.map((label, index) => <option key={label} value={shiftDateAt(week, index)}>{label}</option>)}</select><select aria-label="授業時間帯" value={item.periodId} onChange={event => edit(item.id, { periodId: event.target.value })}>{visiblePeriods.filter(target => !target.courseOnly || currentPrograms.some(program => program.startDate <= item.date && item.date <= program.endDate)).map(target => <option key={target.id} value={target.id}>{target.startTime}</option>)}</select>
            <button className="shift-remove" disabled={importedCourse} title={importedCourse ? '講習日程の削除は講習授業管理から行ってください' : `${studentNames.get(item.studentKey) || '生徒'}を削除`} onClick={() => setEntries(old => old.filter(row => row.id !== item.id))}>×</button>
          </td>,
        ];
      })}
    </tr>); })}</tbody></table></div>}
    {data?.week && <p className="shifts-help">表の変更は「編集を保存」で保存します。担当講師が全員設定されると確定できます。コピー先の週には通常授業を引き継ぎ、講習などの単発予定は必要に応じて反映します。</p>}
  </main>;
}
