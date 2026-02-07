import { initializeApp } from "firebase/app"
import { getFirestore, collection, addDoc } from "firebase/firestore"
import { firebaseConfig } from "../src/firebaseConfig.js"

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const schools = [
  { name: "神戸高校", deviation: 72, minScore: 430, info: "兵庫県トップレベルの進学校。SSH指定校。" },
  { name: "長田高校", deviation: 69, minScore: 410, info: "理数教育に強く国公立大学進学実績が高い。" },
  { name: "兵庫高校", deviation: 67, minScore: 395, info: "伝統ある進学校。文武両道。" },
  { name: "星陵高校", deviation: 65, minScore: 380, info: "落ち着いた校風で安定した進学実績。" },
  { name: "御影高校", deviation: 62, minScore: 360, info: "学習と部活動のバランスが良い。" },
  { name: "夢野台高校", deviation: 60, minScore: 345, info: "地域密着型で面倒見が良い。" },
  { name: "須磨東高校", deviation: 58, minScore: 330, info: "進学・就職に幅広く対応。" },
  { name: "葺合高校", deviation: 56, minScore: 315, info: "市街地に近く通学しやすい。" },
  { name: "舞子高校", deviation: 52, minScore: 295, info: "基礎学力定着重視。" },
  { name: "伊川谷高校", deviation: 50, minScore: 280, info: "多様な進路に対応。" }
]

async function seed() {
  for (const s of schools) {
    await addDoc(collection(db, "highschools"), s)
    console.log(`added: ${s.name}`)
  }
}

seed()
