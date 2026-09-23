'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { auth } from '@/firebaseConfig';

export default function InviteIssuer({ role, title, description, childKeys = [], disabled = false, onIssued }) {
  const [displayName,setDisplayName]=useState(''),[url,setUrl]=useState(''),[qr,setQr]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;if(!url){setQr('');return}QRCode.toDataURL(url,{width:280,margin:2,errorCorrectionLevel:'M'}).then(value=>active&&setQr(value)).catch(()=>active&&setNotice('招待リンクは発行済みですが、QRコードを表示できませんでした。'));return()=>{active=false}},[url]);
  const create=async()=>{if(!displayName.trim()||disabled||busy)return;setBusy(true);setNotice('');try{const response=await fetch('/api/admin/invites',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser?.getIdToken()}`},body:JSON.stringify({role,displayName,childKeys})}),result=await response.json();if(!response.ok)throw new Error(result.error);setUrl(result.invite.url);setDisplayName('');setNotice('7日間有効・1回限りの招待QRを発行しました。');onIssued?.(result.invite)}catch(error){setNotice(error.message)}finally{setBusy(false)}};
  return <div className="invite-issuer"><h3>{title}</h3>{description&&<p>{description}</p>}<div className="teacher-create invite-create"><input aria-label={`${title}の氏名`} placeholder="氏名" value={displayName} onChange={event=>setDisplayName(event.target.value)}/><button type="button" disabled={disabled||busy||!displayName.trim()} onClick={create}>{busy?'発行中…':'招待QRを発行'}</button></div>{notice&&<p role="status">{notice}</p>}{url&&<div className="invite-box"><strong>招待QR（7日間・1回限り）</strong>{qr&&<img src={qr} width="280" height="280" alt={`${title}用招待QRコード`}/>}<input readOnly value={url}/><button type="button" onClick={()=>navigator.clipboard.writeText(url).then(()=>setNotice('招待リンクをコピーしました。'))}>リンクをコピー</button></div>}</div>;
}
