import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = 'demo-juku-point';
if (process.env.JUKU_DEMO_MODE !== '1' ||
    process.env.GCLOUD_PROJECT !== projectId ||
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
  throw new Error('本番データ保護のため、デモ用エミュレーター以外への投入を拒否しました。');
}

const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const password = 'DemoOnly!2026';
const identities = [
  { uid: 'demo_admin', email: 'admin@demo.example.test', displayName: 'デモ管理者' },
  { uid: 'demo_teacher', email: 'teacher@demo.example.test', displayName: 'デモ講師' },
  { uid: 'demo_parent', email: 'parent@demo.example.test', displayName: 'デモ保護者' },
  { uid: 'demo_student_1', email: 'student@demo.example.test', displayName: '青木 花' },
];
for (const identity of identities) {
  try { await auth.createUser({ ...identity, password, emailVerified: true }); }
  catch (error) {
    if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error;
    await auth.updateUser(identity.uid, { email: identity.email, displayName: identity.displayName, password });
  }
}

const tokyoDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const addDays = (date, days) => {
  const value = new Date(`${date}T12:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const today = tokyoDate();
const weekday = new Date(`${today}T12:00:00+09:00`).getUTCDay();
const monday = addDays(today, -(weekday === 0 ? 6 : weekday - 1));
const programId = `demo-course-${monday.slice(0, 4)}`;
const studentKey = 'user_demo_student_1';
const batch = db.batch();
const onlyIfMissing = async (ref, data) => {
  if (!(await ref.get()).exists) batch.set(ref, data);
};
batch.set(db.collection('admins').doc('demo_admin'), { displayName: 'デモ管理者', active: true }, { merge: true });
batch.set(db.collection('teachers').doc('demo_teacher'), { displayName: 'デモ講師', active: true }, { merge: true });
batch.set(db.collection('parentAccounts').doc('demo_parent'), { displayName: 'デモ保護者', active: true }, { merge: true });
batch.set(db.collection('parentLinks').doc('demo_parent').collection('children').doc(studentKey), { active: true }, { merge: true });
await onlyIfMissing(db.collection('users').doc('demo_student_1'), {
  realName: '青木 花', displayName: '青木 花', grade: 8, active: true, points: 0,
  lessonSchedule: {
    weekdays: [1, 3], startDate: monday,
    slots: {
      '1': { startTime: '16:40', subject: '数学', subjectCode: 'math' },
      '3': { startTime: '18:20', subject: '英語', subjectCode: 'english' },
    },
  },
});
await onlyIfMissing(db.collection('adminTermSettings').doc(monday.slice(0, 4)), {
  terms: { 2: { start: addDays(monday, -30), end: addDays(monday, 100) } },
});
await onlyIfMissing(db.collection('coursePrograms').doc(programId), {
  name: 'デモ講習', startDate: monday, endDate: addDays(monday, 34),
  application: { enabled: true, deadline: addDays(monday, 20), mode: 'fixed', courses: [{ id: 'demo-two-lessons', name: '2コマ', lessons: 2, price: 10000 }] },
});
await onlyIfMissing(db.collection('courseApplications').doc(`${programId}_${studentKey}`), {
  programId, studentKey, parentUid: 'demo_parent', status: 'applied',
  courseId: 'demo-two-lessons', lessons: 2, total: 10000,
  confirmedLessons: null, countConfirmedAt: null,
});
await onlyIfMissing(db.collection('teacherShiftPreferences').doc('demo_teacher'), {
  subjects: ['math', 'english'], grades: [8],
  availability: { [addDays(monday, 1)]: ['course-early', 'period-4'], [addDays(monday, 3)]: ['period-5'] },
  updatedAt: FieldValue.serverTimestamp(),
});
await batch.commit();
console.log(`Demo data ready for week ${monday}.`);
console.log(`Admin: admin@demo.example.test / ${password}`);
console.log(`Teacher: teacher@demo.example.test / ${password}`);
console.log(`Parent: parent@demo.example.test / ${password}`);
console.log(`Student: student@demo.example.test / ${password}`);
