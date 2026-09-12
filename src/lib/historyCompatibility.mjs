export function historyMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

// Match copies one-to-one. Never collapse two purchases within the same source.
export function mergeRewardHistory(modern, legacy) {
  const remaining = [...modern];
  const result = [...modern];
  for (const item of legacy) {
    const time = historyMillis(item.date || item.createdAt);
    const index = remaining.findIndex((other) => time > 0 &&
      historyMillis(other.date || other.createdAt) === time &&
      other.name === item.name && Number(other.cost) === Number(item.cost) &&
      (!other.rewardId || !item.rewardId || other.rewardId === item.rewardId));
    if (index >= 0) remaining.splice(index, 1);
    else result.push(item);
  }
  return result.sort((a, b) => historyMillis(b.date || b.createdAt) - historyMillis(a.date || a.createdAt));
}

export async function mapInBatches(items, mapper, size = 4) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(...await Promise.all(items.slice(i, i + size).map(mapper)));
  }
  return result;
}
