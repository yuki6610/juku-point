'use client';
import { DIFFICULTY_LABELS, materialMatchesSubject } from '@/lib/homeworkModel.mjs';

const MIDDLE_SUBJECTS=[['japanese','国語'],['math','数学'],['english','英語'],['science','理科'],['social','社会']];
const ELEMENTARY_SUBJECTS=[['japanese','国語'],['arithmetic','算数'],['english','英語'],['science','理科'],['social','社会']];

export default function HomeworkAssignmentRow({ item, materials, elementary=false, onChange, onRemove, removeDisabled=false }) {
  const material=materials.find(value=>value.id===item.materialId);
  const options=materials.filter(value=>(value.id!=='words'||value.id===item.materialId)&&materialMatchesSubject(value,item.subject||'all'));
  const patch=value=>onChange({...item,...value});
  return <div className="homework-assignment-row">
    <select aria-label="宿題の教科" value={item.subject||'all'} onChange={event=>patch({subject:event.target.value,materialId:'',range:'',customLabel:'',difficulty:3})}>
      <option value="all">教科を選択</option>{(elementary?ELEMENTARY_SUBJECTS:MIDDLE_SUBJECTS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
    <select aria-label="宿題の教材" value={item.materialId} onChange={event=>{const selected=materials.find(value=>value.id===event.target.value);patch({materialId:event.target.value,range:'',customLabel:'',difficulty:Number(selected?.difficulty||3)})}}>
      <option value="">教材を選択</option>{options.map(value=><option key={value.id} value={value.id}>{value.label}</option>)}
    </select>
    {(material?.customLabel||material?.id==='other')&&<label className="custom-homework-name"><span>宿題名</span><input aria-label="その他の宿題名" placeholder="例：計算プリント（自由に変更できます）" value={item.customLabel||''} onChange={event=>patch({customLabel:event.target.value})}/></label>} 
    <input aria-label={material?.rangeType==='number'?'番号範囲':'ページ範囲'} inputMode="text" placeholder={material?.rangeType==='number'?'例：101-150':material?.customLabel?'ページがない場合は空欄':'例：10-15,20'} value={item.range||''} onChange={event=>patch({range:event.target.value})}/>
    <input aria-label="宿題の備考" maxLength="300" placeholder="備考（任意）" value={item.note||''} onChange={event=>patch({note:event.target.value})}/>
    <select className="homework-difficulty" aria-label="宿題の難易度" value={item.difficulty||material?.difficulty||3} onChange={event=>patch({difficulty:Number(event.target.value)})}>{Object.entries(DIFFICULTY_LABELS).map(([value,label])=><option key={value} value={value}>★{value} {label}</option>)}</select>
    <button type="button" disabled={removeDisabled} onClick={onRemove}>削除</button>
  </div>;
}
