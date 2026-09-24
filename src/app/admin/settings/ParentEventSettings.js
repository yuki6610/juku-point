'use client';
import { useEffect,useState } from 'react';
import { auth } from '@/firebaseConfig';
import './parent-events.css';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());
const blank=()=>({id:crypto.randomUUID(),name:'',type:'classroom',startDate:today(),endDate:today(),startTime:'',endTime:'',targetType:'all',targetValue:'',showParent:true,showStudent:false});
export default function ParentEventSettings(){
 const[items,setItems]=useState([]),[draftIds,setDraftIds]=useState([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState('');
 const api=async(url,options={})=>{const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser?.getIdToken()}`}}),data=await response.json();if(!response.ok)throw new Error(data.error);return data};
 const load=()=>api('/api/admin/parent-events').then(data=>setItems(data.items)).catch(error=>setNotice(error.message));
 useEffect(()=>{load()},[]);
 const update=(id,field,value)=>setItems(old=>old.map(item=>item.id===id?{...item,[field]:value}:item));
 const add=()=>{const item=blank();setDraftIds(old=>[...old,item.id]);setItems(old=>[item,...old])};
 const save=async item=>{setBusy(item.id);try{await api('/api/admin/parent-events',{method:'POST',body:JSON.stringify(item)});setDraftIds(old=>old.filter(id=>id!==item.id));setNotice(item.showParent===false?`${item.name}を保存しました。`:`${item.name}を保存しました。保護者カレンダーに反映されます。`);await load()}catch(error){setNotice(error.message)}finally{setBusy('')}};
 const remove=async item=>{if(!confirm(`${item.name||'この予定'}を削除しますか？`))return;if(draftIds.includes(item.id)){setItems(old=>old.filter(row=>row.id!==item.id));setDraftIds(old=>old.filter(id=>id!==item.id));return}setBusy(item.id);try{await api(`/api/admin/parent-events?id=${encodeURIComponent(item.id)}`,{method:'DELETE'});setNotice('予定を削除しました。');await load()}catch(error){setNotice(error.message)}finally{setBusy('')}};
 return <section className="event-settings"><header><span>保護者カレンダー</span><h2>追加する予定</h2><p>通常授業・振替・宿題確認日は自動表示されます。学校行事や教室からの予定だけ登録してください。</p></header>
  {notice&&<p role="status">{notice}</p>}
  <button type="button" disabled={draftIds.length>0} onClick={add}>＋ 予定を追加</button>
  <div className="event-admin-list">{items.map(item=><details key={item.id} defaultOpen={draftIds.includes(item.id)}><summary><strong>{item.name||'新しい予定'}</strong><span>{item.startDate||'日付未設定'}{item.endDate&&item.endDate!==item.startDate?`〜${item.endDate}`:''} · {item.showParent!==false?'保護者に表示':'保護者には非表示'}</span></summary><article>
   <label>予定名<input value={item.name||''} onChange={e=>update(item.id,'name',e.target.value)}/></label>
   <label>種類<select value={item.type||'other'} onChange={e=>update(item.id,'type',e.target.value)}><option value="school">学校</option><option value="classroom">教室</option><option value="interview">面談</option><option value="exam">入試・模試</option><option value="course">講習</option><option value="lesson">授業</option><option value="other">その他</option></select></label>
   <label>開始日<input type="date" value={item.startDate||''} onChange={e=>update(item.id,'startDate',e.target.value)}/></label><label>終了日<input type="date" value={item.endDate||item.startDate||''} onChange={e=>update(item.id,'endDate',e.target.value)}/></label>
   <label>開始時刻<input type="time" value={item.startTime||''} onChange={e=>update(item.id,'startTime',e.target.value)}/></label><label>終了時刻<input type="time" value={item.endTime||''} onChange={e=>update(item.id,'endTime',e.target.value)}/></label>
   <label>公開対象<select value={item.targetType||'all'} onChange={e=>update(item.id,'targetType',e.target.value)}><option value="all">全員</option><option value="grade">学年</option><option value="school">学校</option><option value="student">個別生徒</option><option value="parentTag">保護者タグ</option></select></label>
   {item.targetType!=='all'&&<label>対象の指定<input placeholder={item.targetType==='parentTag'?'タグ名':'対象'} value={item.targetValue||''} onChange={e=>update(item.id,'targetValue',e.target.value)}/></label>}
   <label className="event-visibility"><input type="checkbox" checked={item.showParent!==false} onChange={e=>update(item.id,'showParent',e.target.checked)}/>保護者へ表示</label><label className="event-visibility"><input type="checkbox" checked={item.showStudent===true} onChange={e=>update(item.id,'showStudent',e.target.checked)}/>生徒へ表示</label>
   <div><button type="button" disabled={busy===item.id} onClick={()=>save(item)}>この予定を保存</button><button type="button" disabled={busy===item.id} onClick={()=>remove(item)}>削除</button></div>
  </article></details>)}{!items.length&&<p>追加した予定はありません。</p>}</div>
 </section>;
}
