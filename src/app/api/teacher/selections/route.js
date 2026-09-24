import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff } from '@/lib/staffAccess';
import { FieldValue } from 'firebase-admin/firestore';
import { shiftWeekStart } from '@/lib/weeklyShifts';

export const dynamic = 'force-dynamic';

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const validKey = (value) => /^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(value || '');
const selectionsRef = (date) => adminDb.collection('teacherDailySelections').doc(date).collection('teachers');

async function selectionState(date, uid) {
  const [selections, shift] = await Promise.all([
    selectionsRef(date).get(),
    adminDb.collection('weeklyShifts').doc(shiftWeekStart(date)).get(),
  ]);
  const owners = {};
  if (shift.data()?.status === 'confirmed') {
    for (const entry of shift.data().entries || []) {
      if (entry.date === date && validKey(entry.studentKey) && entry.teacherUid) owners[entry.studentKey] = entry.teacherUid;
    }
  }
  for (const teacher of selections.docs) {
    for (const key of teacher.data().studentKeys || []) {
      if (validKey(key) && !owners[key]) owners[key] = teacher.id;
    }
  }
  return {
    mine: selections.docs.find((item) => item.id === uid)?.data().studentKeys || [],
    hasSavedSelection: selections.docs.some((item) => item.id === uid),
    occupiedKeys: Object.keys(owners).filter((key) => owners[key] !== uid),
  };
}

export async function GET(request) {
  try {
    const staff = await requireStaff(request);
    const date = new URL(request.url).searchParams.get('date');
    if (!validDate(date)) throw new Error('授業日を確認してください。');
    if (staff.role === 'admin') return Response.json({ mine: [], hasSavedSelection: false, occupiedKeys: [] });
    return Response.json(await selectionState(date, staff.uid));
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 400 });
  }
}

export async function POST(request) {
  try {
    const staff = await requireStaff(request);
    const { date, studentKeys } = await request.json();
    if (!validDate(date) || !Array.isArray(studentKeys) || studentKeys.length > 300 || studentKeys.some((key) => !validKey(key))) throw new Error('選択した生徒を確認してください。');
    if (staff.role === 'admin') return Response.json({ saved: true, occupiedKeys: [] });
    const next = [...new Set(studentKeys)];
    const state = await selectionState(date, staff.uid);
    const conflict = next.find((key) => state.occupiedKeys.includes(key));
    if (conflict) return Response.json({ error: '他の講師が選択中の生徒が含まれています。画面を更新してください。', occupiedKeys: state.occupiedKeys }, { status: 409 });
    await selectionsRef(date).doc(staff.uid).set({ studentKeys: next, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ saved: true, occupiedKeys: state.occupiedKeys });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 400 });
  }
}
