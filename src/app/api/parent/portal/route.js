import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent } from '@/lib/parentAccess';
import { linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';
import { FieldPath } from 'firebase-admin/firestore';
import { readPublicHomeworkCompatible } from '@/lib/homeworkServer';

export const dynamic = 'force-dynamic';
const cleanItems = (items, pdf = false) => (Array.isArray(items) ? items : []).map((item, index) => ({
  id: String(item.id || index), title: String(item.title || '').slice(0, 120),
  body: String(item.body || '').slice(0, 1000), date: String(item.date || '').slice(0, 10),
  category:String(item.category||'その他').slice(0,50),
  priority: ['important','request','normal'].includes(item.priority) ? item.priority : 'normal',
  startDate: String(item.startDate || '').slice(0,10), endDate: String(item.endDate || '').slice(0,10),
  targetType: ['all','elementary','middle','grade','school','student','parentTag'].includes(item.targetType) ? item.targetType : 'all', targetValue:String(item.targetValue || '').slice(0,140),
  ...(pdf && /^parentDocuments\/[A-Za-z0-9-]+\.pdf$/.test(item.storagePath || '') ? { localFile: true, fileName: String(item.fileName || '資料.pdf').slice(0,120) } : {}),
  ...(pdf && /^https:\/\//.test(item.url || '') ? { url: item.url } : {}),
})).filter(item => item.title);

export async function GET(request) {
  try {
    const parent=await requireParent(request),params=new URL(request.url).searchParams,studentKey=normalizeStudentKey(params.get('student'));
    if (!(await linkedChildren(parent.uid,parent.role==='admin')).includes(studentKey)) return Response.json({error:'この生徒の情報を閲覧する権限がありません。'},{status:403});
    const elementary=studentKey.startsWith('elementary_'),student=await adminDb.collection(elementary?'adminStudents':'users').doc(studentKey.replace(/^(user|elementary)_/,'')).get();
    if(!student.exists)throw new Error('対象生徒を確認できません。');
    const requested = Number(params.get('year'));
    const now = new Date(), defaultYear = now.getMonth()+1<=3 ? now.getFullYear()-1 : now.getFullYear();
    const year = Number.isInteger(requested) && requested >= 2020 && requested <= 2100 ? requested : defaultYear;
    const [content, calendar, configuredEvents,announcementDocs,documentDocs,profile,courseSessionDocs,courseApplicationDocs,interviewSlotDocs] = await Promise.all([
      adminDb.collection('admin_data').doc('parentPortal').get(),
      adminDb.collection('adminLessonCalendars').doc(String(year)).get(),
      adminDb.collection('parentEvents').where('startDate','<=',`${year+1}-12-31`).limit(300).get(),
      adminDb.collection('parentAnnouncements').get(),
      adminDb.collection('parentDocuments').get(),
      adminDb.collection('studentProfiles').doc(studentKey).get(),
      adminDb.collection('courseSessions').where('studentKey','==',studentKey).get(),
      adminDb.collection('courseApplications').where('studentKey','==',studentKey).get(),
      adminDb.collection('interviewSlots').where('studentKey','==',studentKey).get(),
    ]);
    const data = content.data() || {}, dates = calendar.data()?.dates || {},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());
    const grade=Number(student.data().grade),schoolName=String(profile.data()?.schoolName||student.data().schoolName||''),tags=parent.role==='admin'?[]:(parent.profile.tags||[]),targeted=item=>item.targetType==='all'||!item.targetType||item.targetType==='elementary'&&grade<=6||item.targetType==='middle'&&grade>=7&&grade<=9||item.targetType==='grade'&&String(grade)===String(item.targetValue)||item.targetType==='school'&&schoolName===String(item.targetValue||'')||item.targetType==='student'&&String(item.targetValue||'').split(',').map(value=>value.trim()).some(value=>value===studentKey||value===student.id)||item.targetType==='parentTag'&&(parent.role==='admin'||tags.includes(item.targetValue));
    const active=items=>items.filter(item=>targeted(item)&&(!item.startDate||item.startDate<=today)&&(!item.endDate||item.endDate>=today));
    const teachingDates=Object.keys(dates).filter(date=>dates[date]).sort(),weekdays=(student.data().lessonSchedule?.weekdays||student.data().weekdays||[]).map(Number),history=[...(student.data().lessonSchedule?.history||student.data().lessonScheduleHistory||[])].filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.effectiveFrom||'')).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)),lessonStart=String(student.data().lessonSchedule?.startDate||student.data().lessonStartDate||student.data().enrollmentDate||student.data().joinedAt||'').slice(0,10);
    const weekdaysOn=date=>{if(!history.length)return weekdays;const past=history.filter(item=>item.effectiveFrom<=date).at(-1);return (past?.weekdays||(date<history[0].effectiveFrom?history[0].previousWeekdays:null)||weekdays).map(Number)};
    const regular=teachingDates.filter(date=>(!lessonStart||date>=lessonStart)&&weekdaysOn(date).includes(new Date(`${date}T12:00:00+09:00`).getDay())).map(date=>({id:`regular_${date}`,name:'通常授業',type:'lesson',startDate:date,endDate:date,source:'schedule'}));
    const yearStart=teachingDates[0]||`${year}-01-01`,yearEnd=teachingDates.at(-1)||`${year+1}-03-31`,attendancePromise=adminDb.collection('adminLessonAttendance').doc(studentKey).collection('records').where(FieldPath.documentId(),'>=',yearStart).where(FieldPath.documentId(),'<=',yearEnd).limit(400).get();
    const middlePromises=!elementary&&grade>=7&&grade<=9?[1,2,3].map(term=>adminDb.collection('users').doc(student.id).collection('lessonTerms').doc(`${year}_${term}`).collection('records').get()):[];
    const [attendance,...middleTerms]=await Promise.all([attendancePromise,...middlePromises]);
    const makeupMap=new Map();[...attendance.docs,...middleTerms.flatMap(snapshot=>snapshot.docs)].forEach(doc=>{const value=doc.data();if((value.status||value.attendance)==='makeup')makeupMap.set(doc.id,{id:`makeup_${doc.id}`,name:'振替授業',type:'makeup',startDate:doc.id,endDate:doc.id,source:'attendance'})});
    const makeups=[...makeupMap.values()];
    const homework=(await readPublicHomeworkCompatible(studentKey,300,`${year+1}-01-01`)).filter(item=>item.dueDate>=yearStart&&item.dueDate<=yearEnd).map(item=>({id:`homework_${item.id}`,name:'宿題確認日',type:'homework',startDate:item.dueDate,endDate:item.dueDate,detail:item.items.map(row=>`${row.materialLabel} ${row.range}`).join('／'),source:'homework'}));
    const applicationStatus=new Map(courseApplicationDocs.docs.map(doc=>[doc.data().programId,doc.data().status])),courses=courseSessionDocs.docs.map(doc=>({id:`course_${doc.id}`,name:applicationStatus.get(doc.data().programId)==='confirmed'?'講習授業':'講習授業（確認待ち）',type:'course',startDate:doc.data().date,endDate:doc.data().date,startTime:doc.data().startTime||'',endTime:doc.data().endTime||'',detail:doc.data().subject||'',source:'courseSessions'})).filter(item=>item.startDate>=yearStart&&item.startDate<=yearEnd),interviews=interviewSlotDocs.docs.filter(doc=>doc.data().reservationId).map(doc=>({id:`interview_${doc.id}`,name:'保護者面談',type:'interview',startDate:doc.data().date,endDate:doc.data().date,startTime:doc.data().startTime||'',endTime:doc.data().endTime||'',source:'interviewSlots'})).filter(item=>item.startDate>=yearStart&&item.startDate<=yearEnd);
    const manual=configuredEvents.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>item.showParent!==false&&item.endDate>=yearStart&&targeted(item));
    const merge=(legacy,snapshot)=>{const map=new Map((legacy||[]).map(item=>[String(item.id),item]));snapshot.docs.forEach(doc=>map.set(doc.id,{id:doc.id,...doc.data()}));return [...map.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))};
    return Response.json({ year, announcements: active(cleanItems(merge(data.announcements,announcementDocs))).slice(0,100), documents: active(cleanItems(merge(data.documents,documentDocs), true)).slice(0,100), teachingDates, calendarEvents:[...regular,...makeups,...homework,...courses,...interviews,...manual].sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name,'ja')) });
  } catch (error) { return Response.json({ error: error.message || '保護者向け情報を取得できませんでした。' }, { status: error.status || 400 }); }
}
