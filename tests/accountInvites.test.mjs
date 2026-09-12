import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteHash, newInviteSecret, validInviteId, validInviteRole } from '../src/lib/accountInvites.mjs';

test('invitation secrets are random and only hashes are stable', () => {
  const first=newInviteSecret(),second=newInviteSecret();
  assert.notEqual(first,second); assert.equal(inviteHash(first),inviteHash(first)); assert.notEqual(inviteHash(first),inviteHash(second)); assert.equal(inviteHash(first).includes(first),false);
});
test('invitation identifiers and roles are restricted',()=>{
  assert.equal(validInviteId('a'.repeat(32)),true);assert.equal(validInviteId('../admin'),false);assert.equal(validInviteRole('teacher'),true);assert.equal(validInviteRole('parent'),true);assert.equal(validInviteRole('admin'),false);
});
