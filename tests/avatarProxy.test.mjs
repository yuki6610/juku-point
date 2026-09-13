import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/app/api/avatar/route.js',import.meta.url),'utf8');
async function run(url,fetcher){const context={URL,NextResponse:Response,Buffer,AbortController,setTimeout,clearTimeout,fetch:fetcher};vm.createContext(context);vm.runInContext(source.replace(/^import .*\n/gm,'').replaceAll('export ',''),context);return context.GET({nextUrl:new URL('https://app.test/api/avatar?url='+encodeURIComponent(url))})}
const allowed='https://firebasestorage.googleapis.com/v0/b/juku-point.firebasestorage.app/o/avatars%2Falice%2Favatar-123.vrm?token=sample';
test('avatar proxy rejects unrelated buckets and files before fetching',async()=>{let calls=0;for(const target of [allowed.replace('juku-point.firebasestorage.app','other-bucket'),allowed.replace('avatars%2Falice%2Favatar-123.vrm','parentDocuments%2Fprivate.pdf'),allowed.replace('https:','http:')]){assert.equal((await run(target,()=>{calls++})).status,400)}assert.equal(calls,0)});
test('avatar proxy verifies actual streamed size when content-length is absent',async()=>{const response=await run(allowed,async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(21*1024*1024));controller.close()}})));assert.equal(response.status,413)});
