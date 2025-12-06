import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "../firebaseConfig";

/**
 * 汎用カウンタ更新（任意の値を加算できる）
 * @param {string} userId - ユーザーID
 * @param {string} field - 更新したいカウンタ名
 * @param {number} amount - 加算する値（デフォルト1）
 */
export async function incrementCounter(userId, field, amount = 1) {
  const ref = doc(db, "users", userId);
  await updateDoc(ref, {
    [field]: increment(amount),
  });
}
