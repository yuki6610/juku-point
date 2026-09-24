'use client';
import { DIFFICULTY_LABELS, materialMatchesSubject } from '@/lib/homeworkModel.mjs';

const MIDDLE_SUBJECTS=[['japanese','国語'],['math','数学'],['english','英語'],['science','理科'],['social','社会']];
const ELEMENTARY_SUBJECTS=[['japanese','国語'],['arithmetic','算数'],['english','英語'],['science','理科'],['social','社会']];

export default function HomeworkAssignmentRow({ item, materials, elementary=false, onChange, onRemove, removeDisabled=false, materialFirst=false, showDifficulty=true, rangeLabel, rangePlaceholder }) {
  const material=materials.find(value=>value.id===item.materialId);
  const options=materials.filter(value=>(value.id!=='words'||value.id===item.materialId)&&(!materialFirst||!item.subject||item.subject==='all'||materialMatchesSubject(value,item.subject)));
  const patch=value=>onChange({...item,...value});
  const subjectSelect=<select aria-label="宿題の教科" value={item.subject||'all'} onChange={event=>{const subject=event.target.value;patch({subject,...(!materialFirst?{materialId:'',range:'',customLabel:'',difficulty:3}:{}),...(materialFirst&&material&&!materialMatchesSubject(material,subject)?{materialId:'',range:'',customLabel:'',difficulty:3}:{})})}}>
    <option value="all">教科を選択</option>{(elementary?ELEMENTARY_SUBJECTS:MIDDLE_SUBJECTS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
  </select>;
  const materialSelect=<select aria-label="宿題の教材" value={item.materialId} onChange={event=>{const selected=materials.find(value=>value.id===event.target.value);patch({materialId:event.target.value,range:'',customLabel:'',difficulty:Number(selected?.difficulty||3),...(materialFirst&&selected?.subject?{subject:selected.subject}:{})})}}>
      <option value="">教材を選択</option>{options.map(value=><option key={value.id} value={value.id}>{value.id === 'other' ? 'その他' : value.label}</option>)}
  </select>;
  const rangeInput=<input aria-label={material?.rangeType==='number'?'番号範囲':'ページ・範囲・内容'} inputMode="text" placeholder={rangePlaceholder||(material?.rangeType==='number'?'例：101-150':material?.customLabel?'ページがない場合は空欄':'例：10-15、漢字練習')} value={item.range||''} onChange={event=>patch({range:event.target.value})}/>;
  return <div className="homework-assignment-row">
    {materialFirst?materialSelect:subjectSelect}
    {materialFirst?subjectSelect:materialSelect}
    {(material?.customLabel||material?.id==='other')&&<label className="custom-homework-name"><span>宿題名</span><input aria-label="その他の宿題名" placeholder="例：計算プリント（自由に変更できます）" value={item.customLabel||''} onChange={event=>patch({customLabel:event.target.value})}/></label>} 
    {rangeLabel||rangePlaceholder?<label className="homework-range-field"><span>{rangeLabel||'ページ・範囲・内容'}</span>{rangeInput}</label>:rangeInput}
    {showDifficulty&&<select className="homework-difficulty" aria-label="宿題の難易度" value={item.difficulty||material?.difficulty||3} onChange={event=>patch({difficulty:Number(event.target.value)})}>{Object.entries(DIFFICULTY_LABELS).map(([value,label])=><option key={value} value={value}>★{value} {label}</option>)}</select>}
    <button type="button" disabled={removeDisabled} onClick={onRemove}>削除</button>
  </div>;
}
