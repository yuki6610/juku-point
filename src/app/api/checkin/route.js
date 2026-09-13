import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAcademicTerm } from '@/lib/academicCalendarServer';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JUKU_LAT = 34.645149;
const JUKU_LNG = 135.057465;
const LIMIT_M = 100;

function distanceM(lat1, lng1, lat2, lng2) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayJst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function levelAfter(data, gain) {
  let experience = Math.max(0, Number(data.experience || 0) + gain);
  let level = Math.max(1, Number(data.level || 1));
  while (level < 999 && experience >= 100 + (level - 1) * 10) {
    experience -= 100 + (level - 1) * 10;
    level += 1;
  }
  return { experience, level };
}

async function authUser(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('ログインしてください。'), { status: 401 });
  return adminAuth.verifyIdToken(header.slice(7), true);
}

export async function POST(request) {
  try {
    const user = await authUser(request);
    const body = await request.json();
    const action = body.action;
    const pin = String(body.pin || '');
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!['enter', 'exit'].includes(action) || !/^\d{1,8}$/.test(pin)) throw new Error('入力内容が正しくありません。');
    const locationValid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const distance = locationValid ? Math.round(distanceM(lat, lng, JUKU_LAT, JUKU_LNG)) : null;
    const pinDoc = await adminDb.collection('admin_data').doc('checkin').get();
    const expected = action === 'enter' ? String(pinDoc.data()?.enterPin || '1111') : String(pinDoc.data()?.exitPin || '0000');
    if (pin !== expected) throw Object.assign(new Error('PINが間違っています。'), { status: 403 });

    const userRef = adminDb.collection('users').doc(user.uid);
    const active=await userRef.collection('checkins').where('currentSessionActive','==',true).limit(1).get();
    const checkRef = active.empty?userRef.collection('checkins').doc(todayJst()):active.docs[0].ref;
    let season=null;try{season=await getAcademicTerm()}catch{}

    const now = Timestamp.now();
    if (action === 'enter') {
      if (!locationValid || distance > LIMIT_M) {
        await adminDb.collection('illegal_checkins').add({ uid: user.uid, type: locationValid ? 'enter' : 'gps_error', lat: locationValid ? lat : null, lng: locationValid ? lng : null, distanceM: distance, time: now });
        throw Object.assign(new Error('教室から100m以内でのみ開始できます。不正ログに記録しました。'), { status: 403 });
      }
      await adminDb.runTransaction(async tx => {
        const [profile, check] = await Promise.all([tx.get(userRef), tx.get(checkRef)]);
        if(profile.data()?.active===false||profile.data()?.enrollmentStatus==='withdrawn')throw new Error('退塾したアカウントでは自習を開始できません。');
        if (!profile.exists) throw Object.assign(new Error('生徒情報がありません。'), { status: 404 });
        if (check.data()?.currentSessionActive) throw new Error('すでに自習を開始しています。');
        tx.set(checkRef, { currentSessionActive: true, enterAt: now.toMillis(), lastEnterAt: now.toMillis(), sessions: check.data()?.sessions || [], userName: profile.data().realName || profile.data().displayName || '名前未登録', grade: Number(profile.data().grade || 0), updatedAt: now }, { merge: true });
      });
      return Response.json({ ok: true, action });
    }

    const result = await adminDb.runTransaction(async tx => {
      const [profile, check] = await Promise.all([tx.get(userRef), tx.get(checkRef)]);
      if (!profile.exists || !check.exists || !check.data().currentSessionActive) throw new Error('自習開始記録がありません。');
      const minutes = Math.max(0, Math.min(720, Math.floor((now.toMillis() - Number(check.data().lastEnterAt || 0)) / 60000)));
      const gain = Math.floor(minutes / 10) * 5;
      const next = levelAfter(profile.data(), gain);
      const warning = !locationValid || distance > LIMIT_M;
      const location = locationValid ? { lat, lng, distanceM: distance } : null;
      tx.update(checkRef, { sessions: [...(check.data().sessions || []), { enterAt: check.data().lastEnterAt, exitAt: now.toMillis(), minutes, exitLocation: location }], currentSessionActive: false, exitAt: now.toMillis(), lastExitLocation: location, updatedAt: now });
      tx.update(userRef, { selfStudyCount: FieldValue.increment(1), totalStudyMinutes: FieldValue.increment(minutes), ...(season?{termSelfStudyCount: FieldValue.increment(1), termStudyMinutes: FieldValue.increment(minutes)}:{}), experience: next.experience, level: next.level, points: FieldValue.increment(gain), ...(season?{termPoints: FieldValue.increment(gain)}:{}), totalEarnedPoints: FieldValue.increment(gain), lastUpdated: now });
      tx.set(userRef.collection('pointHistory').doc(), { type: 'selfstudy', amount: gain, note: `自習 ${minutes} 分`, affectsEarnedPoints: true, minutes, ...(season?{termId:season.id}:{}), date: todayJst(), createdAt: now });
      if(warning)tx.set(adminDb.collection('illegal_checkins').doc(),{uid:user.uid,type:locationValid?'exit':'gps_error_exit',lat:locationValid?lat:null,lng:locationValid?lng:null,distanceM:distance,time:now});
      return { minutes, warning };
    });

    return Response.json({ ok: true, action, ...result });
  } catch (error) {
    return Response.json({ error: error.message || '処理できませんでした。' }, { status: error.status || 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
