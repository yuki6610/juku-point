import { NextResponse } from 'next/server';
const LIMIT=20*1024*1024;
const BUCKETS=new Set(['juku-point.firebasestorage.app','juku-point.appspot.com']);
export async function GET(request){try{
  const url=new URL(request.nextUrl.searchParams.get('url')||'');
  if(url.protocol!=='https:'||url.username||url.password||url.port)return NextResponse.json({error:'unsupported-avatar-url'},{status:400});
  let bucket,path;
  if(url.hostname==='firebasestorage.googleapis.com'){const parts=url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);bucket=parts?.[1];path=parts?decodeURIComponent(parts[2]):'';if(!url.searchParams.get('token'))throw new Error('missing-download-token');}
  else if(url.hostname==='storage.googleapis.com'){const parts=url.pathname.split('/');bucket=parts[1];path=decodeURIComponent(parts.slice(2).join('/'));}
  if(!BUCKETS.has(bucket)||!/^avatars\/[A-Za-z0-9_-]+\/avatar-[0-9]+\.(vrm|glb)$/.test(path||''))return NextResponse.json({error:'unsupported-avatar-path'},{status:400});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(url,{cache:'no-store',redirect:'error',signal:controller.signal});
    if(!response.ok)return NextResponse.json({error:'avatar-fetch-failed'},{status:response.status});
    if(Number(response.headers.get('content-length')||0)>LIMIT)throw new Error('avatar-too-large');
    const reader=response.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();throw new Error('avatar-too-large')}chunks.push(value);}
    return new NextResponse(Buffer.concat(chunks),{headers:{'Content-Type':'model/gltf-binary','Cache-Control':'private,max-age=300','X-Content-Type-Options':'nosniff'}});
  }finally{clearTimeout(timer)}
}catch(error){return NextResponse.json({error:error.message==='avatar-too-large'?'avatar-too-large':'avatar-fetch-failed'},{status:error.message==='avatar-too-large'?413:400})}}
