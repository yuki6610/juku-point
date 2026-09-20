import { adminDb } from '@/lib/firebaseAdmin';
import { japanDateId, resolveAcademicTerm } from './academicCalendar.mjs';

let cachedSettings=null;
let cachedAt=0;
const CACHE_MS=5*60*1000;

export async function readAcademicSettings() {
  if(cachedSettings&&Date.now()-cachedAt<CACHE_MS)return cachedSettings;
  const snapshot = await adminDb.collection('adminTermSettings').get();
  cachedSettings=snapshot.docs.filter(doc => /^\d{4}$/.test(doc.id)).map(doc => ({ year: Number(doc.id), terms: doc.data().terms || {} }));
  cachedAt=Date.now();
  return cachedSettings;
}
export async function getAcademicTerm(date = japanDateId()) {
  return resolveAcademicTerm(await readAcademicSettings(), date);
}
