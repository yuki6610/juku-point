import { adminDb } from '@/lib/firebaseAdmin';
import { japanDateId, resolveAcademicTerm } from './academicCalendar.mjs';

export async function readAcademicSettings() {
  const snapshot = await adminDb.collection('adminTermSettings').get();
  return snapshot.docs.filter(doc => /^\d{4}$/.test(doc.id)).map(doc => ({ year: Number(doc.id), terms: doc.data().terms || {} }));
}
export async function getAcademicTerm(date = japanDateId()) {
  return resolveAcademicTerm(await readAcademicSettings(), date);
}
