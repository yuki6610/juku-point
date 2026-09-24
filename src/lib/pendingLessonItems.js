import { adminDb } from './firebaseAdmin';

// Parent documents may be missing: Firestore listDocuments still returns their
// references when they have an items subcollection.
export async function pendingLessonItems(collectionName) {
  const parents = await adminDb.collection(collectionName).listDocuments();
  const rows = [];
  for (let offset = 0; offset < parents.length; offset += 10) {
    const snapshots = await Promise.all(parents.slice(offset, offset + 10)
      .map(parent => parent.collection('items').where('status', '==', 'pending').get()));
    snapshots.forEach(snapshot => rows.push(...snapshot.docs));
  }
  return rows;
}
