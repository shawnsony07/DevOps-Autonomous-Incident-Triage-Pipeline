import crypto from 'crypto';
// ❌ BUG: misspelled algorithm name
export function hashData(data) {
  return crypto.createHash('sha-256').update(data).digest('hex');
}