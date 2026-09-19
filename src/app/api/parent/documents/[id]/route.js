import { adminDb,adminStorage } from '@/lib/firebaseAdmin';
import { requireParent,linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';

const visible=(item,{grade,key,studentId,schoolName,tags,isAdmin})=>item.targetType==='all'||!item.targetType||item.targetType==='elementary'&&grade<=6||item.targetType==='middle'&&grade>=7&&grade<=9||item.targetType==='grade'&&String(grade)===String(item.targetValue)||item.targetType==='school'&&schoolName===String(item.targetValue||'')||item.targetType==='student'&&String(item.targetValue||'').split(',').map(value=>value.trim()).some(value=>value===key||value===studentId)||item.targetType==='parentTag'&&(isAdmin||tags.includes(item.targetValue));

export async function GET(request,{params}){
  try{
    const parent=await requireParent(request),query=new URL(request.url).searchParams,key=normalizeStudentKey(query.get('student'));
    if(!(await linkedChildren(parent.uid,parent.role==='admin')).includes(key))return new Response('Forbidden',{status:403});
    const elementary=key.startsWith('elementary_'),studentId=key.replace(/^(user|elementary)_/,'');
    const [student,profile,current,legacy]=await Promise.all([
      adminDb.collection(elementary?'adminStudents':'users').doc(studentId).get(),
      adminDb.collection('studentProfiles').doc(key).get(),
      adminDb.collection('parentDocuments').doc(params.id).get(),
      adminDb.collection('admin_data').doc('parentPortal').get(),
    ]);
    const item=current.exists?{id:current.id,...current.data()}:(legacy.data()?.documents||[]).find(value=>String(value.id)===String(params.id));
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date()),scope={grade:Number(student.data()?.grade),key,studentId,schoolName:String(profile.data()?.schoolName||student.data()?.schoolName||''),tags:parent.profile?.tags||[],isAdmin:parent.role==='admin'};
    if(!student.exists||!/^parentDocuments\/[A-Za-z0-9-]+\.pdf$/.test(item?.storagePath||'')||!visible(item,scope)||(item.startDate&&item.startDate>today)||(item.endDate&&item.endDate<today))return new Response('Not found',{status:404});
    const [buffer]=await adminStorage.bucket().file(item.storagePath).download();
    return new Response(buffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="document.pdf"','Cache-Control':'private,max-age=300'}});
  }catch(error){return new Response(error.message,{status:error.status||400})}
}
