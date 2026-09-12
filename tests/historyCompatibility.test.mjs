import test from 'node:test';
import assert from 'node:assert/strict';
import { historyMillis, mergeRewardHistory, mapInBatches } from '../src/lib/historyCompatibility.mjs';

test('Timestamp, number and ISO dates normalize equally', () => {
  assert.equal(historyMillis({ seconds: 100 }), 100000);
  assert.equal(historyMillis({ toMillis: () => 100000 }), 100000);
  assert.equal(historyMillis('1970-01-01T00:01:40.000Z'), 100000);
  assert.equal(historyMillis(100000), 100000);
  assert.equal(historyMillis('invalid'), 0);
});
test('mixed histories preserve unmatched old data and missing dates', () => {
  const modern = [{ name: 'アイス', cost: -50, date: 100000 }];
  const legacy = [{ name: 'お菓子', cost: -30, date: 90000 }, { name: '旧記録' }];
  assert.equal(mergeRewardHistory(modern, legacy).length, 3);
  assert.equal(legacy.length, 2);
});
test('copies match one-to-one, repeated purchases remain', () => {
  const item = { name: 'アイス', cost: -50, date: 100000 };
  assert.equal(mergeRewardHistory([item], [item]).length, 1);
  assert.equal(mergeRewardHistory([item], [item, item]).length, 2);
  assert.equal(mergeRewardHistory([item, item], []).length, 2);
  assert.equal(mergeRewardHistory([{ ...item, rewardId: 'a' }], [{ ...item, rewardId: 'b' }]).length, 2);
});
test('unknown dates are never deduplicated', () => {
  assert.equal(mergeRewardHistory([{ name: '旧' }], [{ name: '旧' }]).length, 2);
});
test('bounded reads preserve order and surface failures', async () => {
  assert.deepEqual(await mapInBatches([1, 2, 3], async n => n * 2, 2), [2, 4, 6]);
  await assert.rejects(mapInBatches([1], async () => { throw new Error('permission-denied'); }));
});
