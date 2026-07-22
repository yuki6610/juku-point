export const GACHA_COST = 500;

const STATIONERY_WORDS = ["文房具", "ノート", "ペン", "鉛筆", "えんぴつ", "シャープ", "消しゴム", "定規", "ふせん", "付箋", "蛍光"];

export function gachaKind(reward = {}) {
  const name = String(reward.name || "").toLowerCase();
  const category = String(reward.category || "").toLowerCase();
  if (reward.gachaEligible === false) return "excluded";
  if (category === "stationery" || STATIONERY_WORDS.some((word) => name.includes(word.toLowerCase()))) return "excluded";
  if (name.includes("fifa") || name.includes("フィファ")) return "excluded";
  if (name.includes("コストコ") || name.includes("costco")) return "excluded";
  if (
    name.includes("食事代") || name.includes("食事券") || name.includes("円券") || name.includes("食事チケット")
  ) return "meal";
  if (category === "snack" || name.includes("お菓子") || name.includes("スナック") || name.includes("snack")) return "snack";
  return "regular";
}

// 区分は抽選比率の計算だけに利用し、生徒には全景品の個別確率を返す。
const GROUP_SHARE = { meal: 50, snack: 30, regular: 20 };

export function buildGachaPool(rewards) {
  const active = rewards
    .map((reward) => ({ ...reward, kind: gachaKind(reward) }))
    .filter((reward) => reward.kind !== "excluded" && Number(reward.stock || 0) > 0);
  const presentKinds = [...new Set(active.map((reward) => reward.kind))];
  const availableShare = presentKinds.reduce((sum, kind) => sum + GROUP_SHARE[kind], 0);
  if (!availableShare) return [];

  const raw = active.map((reward) => {
    const peers = active.filter((item) => item.kind === reward.kind);
    // 同じ種類では低額券・低価格景品を当たりやすくする。
    const ownWeight = 1 / Math.sqrt(Math.max(Number(reward.cost || 1), 1));
    const peerWeight = peers.reduce(
      (sum, item) => sum + 1 / Math.sqrt(Math.max(Number(item.cost || 1), 1)),
      0,
    );
    const groupShare = (GROUP_SHARE[reward.kind] / availableShare) * 100;
    return { ...reward, probability: groupShare * (ownWeight / peerWeight) };
  });

  // 画面表示と抽選で同じ、小数第2位までの合計100%の値を使う。
  const rounded = raw.map((item) => ({ ...item, probability: Math.round(item.probability * 100) / 100 }));
  const difference = Math.round((100 - rounded.reduce((sum, item) => sum + item.probability, 0)) * 100) / 100;
  if (rounded.length) rounded[rounded.length - 1].probability += difference;
  return rounded;
}

export function serializeGachaReward(reward) {
  return {
    id: reward.id,
    name: String(reward.name || "景品"),
    image: String(reward.image || ""),
    cost: Number(reward.cost || 0),
    stock: Number(reward.stock || 0),
    kind: reward.kind,
    probability: reward.probability,
  };
}
