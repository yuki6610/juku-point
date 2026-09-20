import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff, assertAssigned } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import { readAbsenceCandidates } from '@/lib/absenceCandidates';
export const dynamic='force-dynamic';
export async function GET(request){try{const staff=await requireStaff(request),params=new URL(request.url).searchParams,key=params.get('student'),date=params.get('date');if(!/^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(key||'')||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw new Error('生徒または授業日を確認してください。');assertAssigned(staff,key,date);const elementary=key.startsWith('elementary_'),id=key.replace(/^(user|elementary)_/,'');const snapshot=await adminDb.collection(elementary?'adminStudents':'users').doc(id).get();if(!snapshot.exists)throw new Error('生徒が見つかりません。');const term=resolveAcademicTerm(await readAcademicSettings(),date);const items=await readAbsenceCandidates({studentKey:key,student:{id,...snapshot.data()},year:term.year});return Response.json({items});}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
