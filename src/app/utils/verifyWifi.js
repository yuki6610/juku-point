export default async function verifyWifi() {
  try {
    // 塾内PCで立ち上げたサーバーにアクセス
    const res = await fetch("http://192.168.86.132:5050/ping", { timeout: 2000 });
    const data = await res.json();

    // 期待するSSID名で応答しているか判定
    if (data?.location === "WAM_chidoridaoka") {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.warn("WiFi check failed:", error);
    return false; // アクセスできない＝塾外と判断
  }
}
