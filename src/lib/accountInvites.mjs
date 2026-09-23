import crypto from 'node:crypto';
export const inviteHash = secret => crypto.createHash('sha256').update(String(secret)).digest('hex');
export const newInviteSecret = () => crypto.randomBytes(24).toString('base64url');
export const validInviteId = value => /^[A-Za-z0-9_-]{16,80}$/.test(value || '');
export const validInviteRole = value => ['admin','teacher','parent'].includes(value);
