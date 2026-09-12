'use client';
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { homeworkApi } from '@/lib/homeworkClient';
import { lessonStudent } from '@/lib/lessonStudents.mjs';
import { japanDateId } from '@/lib/academicCalendar.mjs';
import { RESULT_LABELS } from '@/lib/homeworkModel.mjs';
import './homework.css';
export default function HomeworkManager({ onDirtyChange, onBusyChange }) {
  const [students, setStudents] = useState([]), [student, setStudent] = useState(''), [data, setData] = useState(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [assignedDate, setAssignedDate] = useState(japanDateId()), [dueDate, setDueDate] = useState(''), [items, setItems] = useState([{ materialId: '', range: '' }]), [editing, setEditing] = useState(null);
  const [draftId, setDraftId] = useState('');
  const selectedProfile = students.find(item => item.uid === student);
  const audience = Number(selectedProfile?.grade) <= 6 ? 'elementary' : 'middle';
  const availableMaterials = (data?.templates?.materials || []).filter(item => !item.audience || item.audience === 'all' || item.audience === audience);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'adminStudents'))]).then(([users, children]) => setStudents([...users.docs.map(doc => lessonStudent(doc.id, doc.data())), ...children.docs.map(doc => lessonStudent(doc.id, doc.data(), 'elementary'))].filter(Boolean).sort((a, b) => a.grade - b.grade || a.realName.localeCompare(b.realName, 'ja')))).catch(error => setNotice(error.message));
    setDraftId(crypto.randomUUID());
  }, []);
  useEffect(() => {
    let active = true;
    setData(null); setNotice('');
    homeworkApi(`/api/admin/homework${student ? `?student=${encodeURIComponent(student)}` : ''}`).then(result => { if (active) setData(result); }).catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [student]);
  const reset = () => { setEditing(null); setItems([{ materialId: '', range: '' }]); setAssignedDate(japanDateId()); setDueDate(''); setDraftId(crypto.randomUUID()); onDirtyChange(false); };
  const save = async () => {
    if (!student || busy) return;
    setBusy(true); setNotice('');
    try {
      await homeworkApi('/api/admin/homework', { id: editing?.id || draftId, version: editing?.version, student, assignedDate, dueDate, items });
      reset(); setData(await homeworkApi(`/api/admin/homework?student=${encodeURIComponent(student)}`)); setNotice('宿題を保存しました。確認結果は学習記録で入力してください。');
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  };
  const more = async () => { setBusy(true); try { const next = await homeworkApi(`/api/admin/homework?student=${encodeURIComponent(student)}&after=${encodeURIComponent(data.next)}`); setData({ ...next, items: [...data.items, ...next.items] }); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  return <section className="homework-panel"><h2>次回の宿題を登録</h2><p>教材とページ・範囲を毎回登録します。提出状況は学習記録で課題ごとに確認します。</p>
    {notice && <p role="status">{notice}</p>}
    <label>生徒<select disabled={busy} value={student} onChange={event => { if (student && !window.confirm('生徒を切り替えます。入力途中の内容は破棄されます。よろしいですか？')) return; reset(); setStudent(event.target.value); }}><option value="">選択してください</option>{students.map(item => <option key={item.uid} value={item.uid}>{item.realName}</option>)}</select></label>
    {data && student && <><fieldset disabled={busy} onChange={() => onDirtyChange(true)}><legend>{editing ? '宿題内容を変更' : '宿題内容'}</legend><label>指示日<input type="date" value={assignedDate} onChange={event => setAssignedDate(event.target.value)} /></label><label>確認予定日<input type="date" value={dueDate} min={assignedDate} onChange={event => setDueDate(event.target.value)} /></label>
      {items.map((item, index) => <div className="homework-row" key={index}><select aria-label={`教材${index + 1}`} value={item.materialId} onChange={event => setItems(items.map((row, n) => n === index ? { ...row, materialId: event.target.value, range: '' } : row))}><option value="">教材を選択</option>{availableMaterials.map(material => <option key={material.id} value={material.id}>{material.label}</option>)}</select><RangeField material={availableMaterials.find(material=>material.id===item.materialId)} value={item.range} onChange={range=>setItems(items.map((row,n)=>n===index?{...row,range}:row))}/><button disabled={items.length === 1} onClick={() => { setItems(items.filter((_, n) => n !== index)); onDirtyChange(true); }}>項目を外す</button></div>)}
      <button disabled={items.length >= 20} onClick={() => { setItems([...items, { materialId: '', range: '' }]); onDirtyChange(true); }}>＋宿題を追加</button><button onClick={save}>宿題を保存</button>{editing && <button onClick={reset}>編集を終了</button>}
    </fieldset><h3>登録済み宿題</h3>{(data.items || []).map(item => <article key={item.id}><strong>{item.dueDate}確認予定</strong><ul>{item.items.map(row => <li key={row.id}>{row.materialLabel}：{row.range}</li>)}</ul><p>{item.review ? RESULT_LABELS[item.review.status] : '未確認'}</p>{(!item.review || ['pending', 'absent'].includes(item.review.status)) && <button disabled={busy} onClick={() => { setEditing(item); setAssignedDate(item.assignedDate); setDueDate(item.dueDate); setItems(item.items); onDirtyChange(true); }}>内容を変更</button>}</article>)}{data.next && <button disabled={busy} onClick={more}>古い宿題をさらに表示</button>}</>}
  </section>;
}
function RangeField({material,value,onChange}){if(material?.rangeType!=='number')return <input placeholder="ページ・範囲" value={value} onChange={event=>onChange(event.target.value)}/>;const values=String(value||'').match(/\d+/g)||[];return <span className="number-range"><input aria-label="開始番号" type="number" min="1" placeholder="開始番号" value={values[0]||''} onChange={e=>onChange(`No.${e.target.value}〜${values[1]||''}`)}/><b>〜</b><input aria-label="終了番号" type="number" min="1" placeholder="終了番号" value={values[1]||''} onChange={e=>onChange(`No.${values[0]||''}〜${e.target.value}`)}/></span>}
