import { doc, getDoc } from 'firebase/firestore';

// Aggregates are alternative representations, not independent counters to add.
export async function getBehaviorSummary(db, uid, year, term) {
  const number = String(term).replace('学期', '');
  if (!/^[1-3]$/.test(number) || !/^\d{4}$/.test(String(year))) throw new Error('学期が正しくありません');
  const current = await getDoc(doc(db, 'users', uid, 'behaviorSummary', `${year}_${number}`));
  if (current.exists()) return current;
  return getDoc(doc(db, 'users', uid, 'behaviorSummary', `${year}_${number}学期`));
}
