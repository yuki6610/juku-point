import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent } from '@/lib/parentAccess';
import { linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';

export const dynamic = 'force-dynamic';
const cleanItems = (items, pdf = false) => (Array.isArray(items) ? items : []).slice(0, 100).map((item, index) => ({
  id: String(item.id || index), title: String(item.title || '').slice(0, 120),
  body: String(item.body || '').slice(0, 1000), date: String(item.date || '').slice(0, 10),
  priority: ['important','request','normal'].includes(item.priority) ? item.priority : 'normal',
  startDate: String(item.startDate || '').slice(0,10), endDate: String(item.endDate || '').slice(0,10),
  targetType: ['all','elementary','middle','grade','student'].includes(item.targetType) ? item.targetType : 'all', targetValue:String(item.targetValue || '').slice(0,140),
  ...(pdf && /^https:\/\//.test(item.url || '') ? { url: item.url } : {}),
})).filter(item => item.title);

export async function GET(request) {
  try {
    const parent=await requireParent(request),params=new URL(request.url).searchParams,studentKey=normalizeStudentKey(params.get('student'));
    if (!(await linkedChildren(parent.uid,parent.role==='admin')).includes(studentKey)) return Response.json({error:'この生徒の情報を閲覧する権限がありません。'},{status:403});
    const elementary=studentKey.startsWith('elementary_'),student=await adminDb.collection(elementary?'adminStudents':'users').doc(studentKey.replace(/^(user|elementary)_/,'')).get();
    if(!student.exists)throw new Error('対象生徒を確認できません。');
    const requested = Number(params.get('year'));
    const now = new Date(), defaultYear = now.getMonth() + 1 <= 3 ? now.getFullYear() - 1 : now.getFullYear();
    const year = Number.isInteger(requested) && requested >= 2020 && requested <= 2100 ? requested : defaultYear;
    const [content, calendar] = await Promise.all([
      adminDb.collection('admin_data').doc('parentPortal').get(),
      adminDb.collection('adminLessonCalendars').doc(String(year)).get(),
    ]);
    const data = content.data() || {}, dates = calendar.data()?.dates || {},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());
    const grade=Number(student.data().grade),active=items=>items.filter(item=>{const target=item.targetType==='all'||!item.targetType||item.targetType==='elementary'&&grade<=6||item.targetType==='middle'&&grade>=7&&grade<=9||item.targetType==='grade'&&String(grade)===item.targetValue||item.targetType==='student'&&item.targetValue.split(',').map(value=>value.trim()).some(value=>value===studentKey||value===student.id);return target&&(!item.startDate||item.startDate<=today)&&(!item.endDate||item.endDate>=today)});
    return Response.json({ year, announcements: active(cleanItems(data.announcements)), documents: active(cleanItems(data.documents, true)), teachingDates: Object.keys(dates).filter(date => dates[date]).sort() });
  } catch (error) { return Response.json({ error: error.message || '保護者向け情報を取得できませんでした。' }, { status: error.status || 400 }); }
}
