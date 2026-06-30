import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "../firebaseConfig";

/**
 * カウンタ更新
 * fieldは文字列でも配列でもOK
 */
export async function incrementCounter(userId, field, amount = 1) {
  const ref = doc(db, "users", userId);

  const updateData = {};

  if (Array.isArray(field)) {
    field.forEach(f => {
      updateData[f] = increment(amount);
    });
  } else {
    updateData[field] = increment(amount);
  }

  await updateDoc(ref, updateData);
}
