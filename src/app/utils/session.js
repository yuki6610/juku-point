// src/utils/session.js
import { getAuth, onAuthStateChanged } from "firebase/auth";

export function getCurrentUser() {
  if (typeof window === "undefined") return null;
  const data = sessionStorage.getItem("user");
  return data ? JSON.parse(data) : null;
}

// 🔒 Firebase認証を完全に待つ
export async function requireLogin(router) {
  const auth = getAuth();

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // 監視解除

      if (user) {
        const userData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        };
        sessionStorage.setItem("user", JSON.stringify(userData));
        resolve(userData);
      } else {
        alert("ログインしてください。");
        router.push("/login");
        resolve(null);
      }
    });
  });
}

export function logout(router) {
  sessionStorage.removeItem("user");
  router.push("/login");
}
