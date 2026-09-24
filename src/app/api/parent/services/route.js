import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent,linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';

export const dynamic='force-dynamic';
const validId=value=>/^[A-Za-z0-9_-]{6,160}$/.test(value||'');
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());
const whole=(value,min=0,max=10000000)=>{const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,Math.floor(number))):min};
const list=async(name,field,value)=>{let query=adminDb.collection(name);if(field)query=query.where(field,'==',value);if(name==='interviewSlots')query=query.where('date','>=',today());const items=(await query.get()).docs.map(doc=>({id:doc.id,...doc.data()}));return name==='courseLessonPlans'?items.filter(item=>item.status==='confirmed'):items};
const publicAssignment=item=>({id:item.id,programId:item.programId,type:item.type,subject:String(item.subject||''),material:String(item.material||''),range:String(item.range||''),assignedDate:String(item.assignedDate||''),checkWeekStart:String(item.checkWeekStart||''),checkWeekEnd:String(item.checkWeekEnd||''),checkedDate:String(item.checkedDate||''),status:item.status==='checked'?'checked':'assigned',result:item.status==='checked'?{homeworkStatus:item.result?.homeworkStatus||'',wordCorrect:Number(item.result?.wordCorrect||0),wordTotal:Number(item.result?.wordTotal||0)}:null});

async function context(request){const parent=await requireParent(request),params=new URL(request.url).searchParams,body=request.method==='GET'?null:await request.json(),studentKey=normalizeStudentKey(params.get('student')||body?.student);if(!(await linkedChildren(parent.uid,parent.role==='admin')).includes(studentKey))throw Object.assign(new Error('この生徒を操作する権限がありません。'),{status:403});const elementary=studentKey.startsWith('elementary_'),student=await adminDb.collection(elementary?'adminStudents':'users').doc(studentKey.replace(/^(user|elementary)_/,'')).get(),grade=Number(student.data()?.grade);if(!student.exists||grade<1||grade>9)throw new Error('対象生徒を確認できません。');return{parent,studentKey,student,grade,body}}

export async function GET(request){try{
  const{parent,studentKey,grade}=await context(request);
  const[programs,applications,availability,sessions,assignments,periods,slots,reservations]=await Promise.all([list('coursePrograms'),list('courseApplications','studentKey',studentKey),list('courseAvailability','studentKey',studentKey),list('courseLessonPlans','studentKey',studentKey),Promise.resolve([]),list('interviewPeriods'),list('interviewSlots'),list('interviewReservations','studentKey',studentKey)]);
  const participantId=studentKey.startsWith('elementary_')?studentKey:studentKey.slice(5),activePrograms=grade>=7&&grade<=9?programs.filter(item=>item.application?.enabled===true):[],assignmentLists=await Promise.all(activePrograms.map(program=>adminDb.collection('coursePrograms').doc(program.id).collection('assignments').where('uid','==',participantId).get()));
  assignmentLists.forEach((snapshot,index)=>snapshot.docs.forEach(doc=>assignments.push(publicAssignment({id:doc.id,programId:activePrograms[index].id,...doc.data()}))));
  const visiblePeriods=periods.filter(item=>item.active!==false&&item.endDate>=today()),reservationMap=new Map(reservations.map(item=>[item.id,item]));
  const visibleSlots=slots.filter(item=>visiblePeriods.some(period=>period.id===item.periodId)).map(item=>{
    const mine=item.parentUid===parent.uid&&item.studentKey===studentKey&&item.reservationId;
    const reservation=mine?reservationMap.get(item.reservationId):null;
    return{id:item.id,periodId:item.periodId,date:item.date,startTime:item.startTime,endTime:item.endTime,available:item.available!==false,occupied:Boolean(item.reservationId),reservedByMe:Boolean(mine),reservationStatus:reservation?.status||null};
  });
  return Response.json({programs:activePrograms,applications,availability,sessions:sessions.sort((a,b)=>a.date.localeCompare(b.date)||String(a.startTime).localeCompare(String(b.startTime))),assignments,periods:visiblePeriods,slots:visibleSlots});
}catch(error){return Response.json({error:error.message},{status:error.status||400})}}

export async function POST(request){try{const{parent,studentKey,grade,body}=await context(request),now=FieldValue.serverTimestamp();if(['applyCourse','cancelCourse','saveAvailability','confirmSchedule'].includes(body.action)&&!(grade>=7&&grade<=9))throw new Error('講習機能は中学生が対象です。');
  if(body.action==='applyCourse'){
    if(!validId(body.programId))throw new Error('講習を選択してください。');
    const programRef=adminDb.collection('coursePrograms').doc(body.programId),program=await programRef.get(),setting=program.data()?.application;
    if(!program.exists||setting?.enabled!==true)throw new Error('この講習は現在申し込めません。');
    if(setting.deadline&&today()>setting.deadline)throw new Error('申込期限を過ぎています。');
    let lessons=0,unitPrice=0,total=0,courseId='';
    if(setting.mode==='variable'){lessons=whole(body.lessons,1,100);unitPrice=whole(setting.unitPrice);total=lessons*unitPrice;}
    else{const course=(setting.courses||[]).find(item=>item.id===body.courseId);if(!course)throw new Error('コースを選択してください。');courseId=course.id;lessons=whole(course.lessons,1,100);total=whole(course.price);}
    const ref=adminDb.collection('courseApplications').doc(`${body.programId}_${studentKey}`),old=await ref.get();
    await ref.set({programId:body.programId,studentKey,parentUid:parent.uid,status:'applied',courseId,lessons,unitPrice,total,confirmedLessons:null,countConfirmedAt:null,countConfirmedBy:null,createdAt:old.data()?.createdAt||now,updatedAt:now,history:FieldValue.arrayUnion({status:'applied',at:new Date().toISOString(),by:parent.uid})},{merge:true});
    await programRef.set({participantIds:FieldValue.arrayUnion(studentKey.startsWith('elementary_')?studentKey:studentKey.slice(5)),updatedAt:now},{merge:true});
    return Response.json({saved:true,total});
  }
  if(body.action==='cancelCourse'){if(!validId(body.programId))throw new Error('講習を選択してください。');const[program,sessions]=await Promise.all([adminDb.collection('coursePrograms').doc(body.programId).get(),adminDb.collection('courseLessonPlans').where('studentKey','==',studentKey).get()]);if(program.data()?.application?.deadline&&today()>program.data().application.deadline)throw new Error('申込期限後の変更は教室へお問い合わせください。');if(sessions.docs.some(doc=>doc.data().programId===body.programId))throw new Error('日程作成後の変更は教室へお問い合わせください。');await adminDb.collection('courseApplications').doc(`${body.programId}_${studentKey}`).set({status:'cancelled',updatedAt:now,history:FieldValue.arrayUnion({status:'cancelled',at:new Date().toISOString(),by:parent.uid})},{merge:true});await program.ref.set({participantIds:FieldValue.arrayRemove(studentKey.startsWith('elementary_')?studentKey:studentKey.slice(5)),updatedAt:now},{merge:true});return Response.json({saved:true});}
  if(body.action==='saveAvailability'){if(!validId(body.programId))throw new Error('講習を選択してください。');const[program,application]=await Promise.all([adminDb.collection('coursePrograms').doc(body.programId).get(),adminDb.collection('courseApplications').doc(`${body.programId}_${studentKey}`).get()]);if(!program.exists||!application.exists||application.data().status==='cancelled')throw new Error('有効な講習申込を確認できません。');const entries=(body.entries||[]).slice(0,200).map(item=>({date:String(item.date||''),startTime:String(item.startTime||''),endTime:String(item.endTime||'')}));if(entries.some(item=>!validDate(item.date)||!/^\d{2}:\d{2}$/.test(item.startTime)||!/^\d{2}:\d{2}$/.test(item.endTime)||item.endTime<=item.startTime||program.data().startDate&&item.date<program.data().startDate||program.data().endDate&&item.date>program.data().endDate))throw new Error('来校できない日時を確認してください。');await adminDb.collection('courseAvailability').doc(`${body.programId}_${studentKey}`).set({programId:body.programId,studentKey,parentUid:parent.uid,entries,status:'submitted',updatedAt:now},{merge:true});await application.ref.set({status:'scheduling',updatedAt:now},{merge:true});return Response.json({saved:true});}
  if(body.action==='confirmSchedule'){if(!validId(body.programId)||!['confirmed','changeRequested'].includes(body.response))throw new Error('回答を確認してください。');const[application,sessions]=await Promise.all([adminDb.collection('courseApplications').doc(`${body.programId}_${studentKey}`).get(),adminDb.collection('courseLessonPlans').where('studentKey','==',studentKey).get()]);if(!application.exists||application.data().status==='cancelled')throw new Error('有効な講習申込を確認できません。');const count=sessions.docs.filter(doc=>doc.data().programId===body.programId&&doc.data().status==='confirmed').length;if(body.response==='confirmed'&&count<Number(application.data().confirmedLessons||application.data().lessons||0))throw new Error('すべての日程が配置されてから確定できます。');await application.ref.set({status:body.response,changeRequest:String(body.note||'').trim().slice(0,500),updatedAt:now,history:FieldValue.arrayUnion({status:body.response,at:new Date().toISOString(),by:parent.uid})},{merge:true});return Response.json({saved:true});}
  if(body.action==='reserveInterview'){
    if(!validId(body.slotId))throw new Error('面談枠を選択してください。');
    await adminDb.runTransaction(async tx=>{
      const ref=adminDb.collection('interviewSlots').doc(body.slotId),slot=await tx.get(ref);
      if(!slot.exists||slot.data().available===false||slot.data().reservationId)throw Object.assign(new Error('この枠は申請できません。別の時間を選択してください。'),{status:409});
      const period=await tx.get(adminDb.collection('interviewPeriods').doc(slot.data().periodId));
      if(!period.exists||period.data().active===false||period.data().endDate<today()||slot.data().date<today()||slot.data().date<period.data().startDate||slot.data().date>period.data().endDate||period.data().deadline&&period.data().deadline<today())throw new Error('この面談枠は現在申請できません。');
      const prior=await tx.get(adminDb.collection('interviewReservations').where('studentKey','==',studentKey));
      if(prior.docs.some(doc=>doc.data().periodId===slot.data().periodId&&['pending','confirmed'].includes(doc.data().status)))throw new Error('この面談期間には申請中または確定済みの日時があります。');
      const reservationId=crypto.randomUUID();
      tx.set(ref,{reservationId,parentUid:parent.uid,studentKey,reservedAt:now,updatedAt:now},{merge:true});
      tx.set(adminDb.collection('interviewReservations').doc(reservationId),{slotId:body.slotId,periodId:slot.data().periodId,parentUid:parent.uid,studentKey,status:'pending',date:slot.data().date,startTime:slot.data().startTime,endTime:slot.data().endTime,createdAt:now,updatedAt:now});
    });
    return Response.json({saved:true,status:'pending'});
  }
  if(body.action==='cancelInterview'){
    if(!validId(body.slotId))throw new Error('面談枠を選択してください。');
    await adminDb.runTransaction(async tx=>{
      const ref=adminDb.collection('interviewSlots').doc(body.slotId),slot=await tx.get(ref);
      if(!slot.exists||slot.data().parentUid!==parent.uid||slot.data().studentKey!==studentKey||!slot.data().reservationId)throw new Error('申請を確認できません。');
      const reservationRef=adminDb.collection('interviewReservations').doc(slot.data().reservationId),reservation=await tx.get(reservationRef);
      if(!reservation.exists||reservation.data().slotId!==body.slotId||reservation.data().status!=='pending')throw new Error('承認済みの面談は画面から取り消せません。教室へご連絡ください。');
      tx.set(ref,{reservationId:null,parentUid:null,studentKey:null,reservedAt:null,updatedAt:now},{merge:true});
      tx.set(reservationRef,{status:'cancelled',cancelledAt:now,cancelledBy:parent.uid,updatedAt:now},{merge:true});
    });
    return Response.json({saved:true});
  }
  throw new Error('操作が正しくありません。');
}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
