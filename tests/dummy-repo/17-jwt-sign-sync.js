import jwt from 'jsonwebtoken';
// ❌ BUG: jwt.sign with a callback returns undefined but code expects a token string
export function generateToken(payload) {
  const token = jwt.sign(payload, 'secret', (err, t) => t);
  return token.split('.');
}