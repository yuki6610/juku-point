import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent } from '@/lib/parentAccess';
import { linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';
import { FieldPath } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
let sharedPortalCache={value:null,expires:0};
const sharedYearCache=new Map();
const readSharedPortal=async()=>{if(sharedPortalCache.value&&sharedPortalCache.expires>Date.now())return sharedPortalCache.value;const[content,announcements,documents]=await Promise.all([adminDb.collection('admin_data').doc('parentPortal').get(),adminDb.collection('parentAnnouncements').get(),adminDb.collection('parentDocuments').get()]);const value={content,announcements,documents};sharedPortalCache={value,expires:Date.now()+2*60*1000};return value};
const readSharedYear=async year=>{const cached=sharedYearCache.get(year);if(cached?.expires>Date.now())return cached.value;const[calendar,events]=await Promise.all([adminDb.collection('adminLessonCalendars').doc(String(year)).get(),adminDb.collection('parentEvents').where('startDate','<=',`${year+1}-12-31`).limit(300).get()]),value={calendar,events};sharedYearCache.set(year,{value,expires:Date.now()+2*60*1000});return value};
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
    const parent=await requireParent(request),params=new URL(request.url).searchParams,studentKey=normalizeStudentKey(params.get('student')),full=params.get('detail')==='full';
    if (!(await linkedChildren(parent.uid,parent.role==='admin')).includes(studentKey)) return Response.json({error:'この生徒の情報を閲覧する権限がありません。'},{status:403});
    const elementary=studentKey.startsWith('elementary_'),student=await adminDb.collection(elementary?'adminStudents':'users').doc(studentKey.replace(/^(user|elementary)_/,'')).get();
    if(!student.exists)throw new Error('対象生徒を確認できません。');
    const grade=Number(student.data().grade);
    const requested = Number(params.get('year'));
    const now = new Date(), defaultYear = now.getMonth()+1<=3 ? now.getFullYear()-1 : now.getFullYear();
    const year = Number.isInteger(requested) && requested >= 2020 && requested <= 2100 ? requested : defaultYear;
    const [shared, sharedYear,profile,courseSessionDocs,courseApplicationDocs,interviewSlotDocs,courseProgramDocs,interviewPeriodDocs] = await Promise.all([
      readSharedPortal(),
      readSharedYear(year),
      adminDb.collection('studentProfiles').doc(studentKey).get(),
      adminDb.collection('courseSessions').where('studentKey','==',studentKey).get(),
      adminDb.collection('courseApplications').where('studentKey','==',studentKey).get(),
      adminDb.collection('interviewSlots').where('studentKey','==',studentKey).get(),
      grade>=7&&grade<=9?adminDb.collection('coursePrograms').get():Promise.resolve({docs:[]}),
      adminDb.collection('interviewPeriods').get(),
    ]);
    const{content,announcements:announcementDocs,documents:documentDocs}=shared;
    const{calendar,events:configuredEvents}=sharedYear;
    const data = content.data() || {}, dates = calendar.data()?.dates || {},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());
    const schoolName=String(profile.data()?.schoolName||student.data().schoolName||''),tags=parent.role==='admin'?[]:(parent.profile.tags||[]),targeted=item=>item.targetType==='all'||!item.targetType||item.targetType==='elementary'&&grade<=6||item.targetType==='middle'&&grade>=7&&grade<=9||item.targetType==='grade'&&String(grade)===String(item.targetValue)||item.targetType==='school'&&schoolName===String(item.targetValue||'')||item.targetType==='student'&&String(item.targetValue||'').split(',').map(value=>value.trim()).some(value=>value===studentKey||value===student.id)||item.targetType==='parentTag'&&(parent.role==='admin'||tags.includes(item.targetValue));
    const active=items=>items.filter(item=>targeted(item)&&(!item.startDate||item.startDate<=today)&&(!item.endDate||item.endDate>=today));
    const teachingDates=Object.keys(dates).filter(date=>dates[date]).sort(),weekdays=(student.data().lessonSchedule?.weekdays||student.data().weekdays||[]).map(Number),history=[...(student.data().lessonSchedule?.history||student.data().lessonScheduleHistory||[])].filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.effectiveFrom||'')).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)),lessonStart=String(student.data().lessonSchedule?.startDate||student.data().lessonStartDate||student.data().enrollmentDate||student.data().joinedAt||'').slice(0,10);
    const weekdaysOn=date=>{if(!history.length)return weekdays;const past=history.filter(item=>item.effectiveFrom<=date).at(-1);return (past?.weekdays||(date<history[0].effectiveFrom?history[0].previousWeekdays:null)||weekdays).map(Number)};
    const regular=teachingDates.filter(date=>(!lessonStart||date>=lessonStart)&&weekdaysOn(date).includes(new Date(`${date}T12:00:00+09:00`).getDay())).map(date=>({id:`regular_${date}`,name:'通常授業',type:'lesson',startDate:date,endDate:date,source:'schedule'}));
    const yearStart=teachingDates[0]||`${year}-01-01`,yearEnd=teachingDates.at(-1)||`${year+1}-03-31`,attendancePromise=full?adminDb.collection('adminLessonAttendance').doc(studentKey).collection('records').where(FieldPath.documentId(),'>=',yearStart).where(FieldPath.documentId(),'<=',yearEnd).limit(400).get():Promise.resolve({docs:[]});
    const middlePromises=full&&!elementary&&grade>=7&&grade<=9?[1,2,3].map(term=>adminDb.collection('users').doc(student.id).collection('lessonTerms').doc(`${year}_${term}`).collection('records').get()):[];
    const [attendance,...middleTerms]=await Promise.all([attendancePromise,...middlePromises]);
    const makeupMap=new Map();[...attendance.docs,...middleTerms.flatMap(snapshot=>snapshot.docs)].forEach(doc=>{const value=doc.data();if((value.status||value.attendance)==='makeup')makeupMap.set(doc.id,{id:`makeup_${doc.id}`,name:'振替授業',type:'makeup',startDate:doc.id,endDate:doc.id,source:'attendance'})});
    const makeups=[...makeupMap.values()];
    const applicationStatus=new Map(courseApplicationDocs.docs.map(doc=>[doc.data().programId,doc.data().status])),reservedPeriodIds=new Set(interviewSlotDocs.docs.filter(doc=>doc.data().reservationId).map(doc=>doc.data().periodId)),actionItems=[...courseProgramDocs.docs.filter(doc=>{const item=doc.data(),status=applicationStatus.get(doc.id);return item.application?.enabled===true&&(!item.application.deadline||item.application.deadline>=today)&&(!status||status==='cancelled')}).map(doc=>({id:`course_${doc.id}`,type:'course',title:`${doc.data().name||'講習'}の申込`,deadline:doc.data().application?.deadline||'',message:'講習の申込内容をご確認ください。'})),...interviewPeriodDocs.docs.filter(doc=>{const item=doc.data();return item.active!==false&&item.endDate>=today&&!reservedPeriodIds.has(doc.id)}).map(doc=>({id:`interview_${doc.id}`,type:'interview',title:`${doc.data().name||'保護者面談'}の予約`,deadline:doc.data().deadline||doc.data().endDate||'',message:'面談日時を選択してください。'}))].sort((a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999')),courses=courseSessionDocs.docs.map(doc=>({id:`course_${doc.id}`,name:applicationStatus.get(doc.data().programId)==='confirmed'?'講習授業':'講習授業（確認待ち）',type:'course',startDate:doc.data().date,endDate:doc.data().date,startTime:doc.data().startTime||'',endTime:doc.data().endTime||'',detail:doc.data().subject||'',source:'courseSessions'})).filter(item=>item.startDate>=yearStart&&item.startDate<=yearEnd),interviews=interviewSlotDocs.docs.filter(doc=>doc.data().reservationId).map(doc=>({id:`interview_${doc.id}`,name:'保護者面談',type:'interview',startDate:doc.data().date,endDate:doc.data().date,startTime:doc.data().startTime||'',endTime:doc.data().endTime||'',source:'interviewSlots'})).filter(item=>item.startDate>=yearStart&&item.startDate<=yearEnd);
    const manual=configuredEvents.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>item.showParent!==false&&item.endDate>=yearStart&&targeted(item));
    const merge=(legacy,snapshot)=>{const map=new Map((legacy||[]).map(item=>[String(item.id),item]));snapshot.docs.forEach(doc=>map.set(doc.id,{id:doc.id,...doc.data()}));return [...map.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))};
    return Response.json({ year, detail:full?'full':'summary', actionItems, announcements: active(cleanItems(merge(data.announcements,announcementDocs))).slice(0,100), documents: active(cleanItems(merge(data.documents,documentDocs), true)).slice(0,100), teachingDates, calendarEvents:[...regular,...makeups,...courses,...interviews,...manual].sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name,'ja')) });
  } catch (error) { return Response.json({ error: error.message || '保護者向け情報を取得できませんでした。' }, { status: error.status || 400 }); }
}
