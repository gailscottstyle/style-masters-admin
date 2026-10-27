import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto';
export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, hash) {
  try { const [salt, value] = hash.split(':'); const expected = Buffer.from(value, 'hex'); const actual = scryptSync(password, salt, 64); return expected.length === actual.length && timingSafeEqual(expected, actual); } catch { return false; }
}
export function signSession(email, secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ email, exp: now + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function readSession(token, secret, email, now = Date.now()) {
  try {
    const [body, signature] = token.split('.');
    const expected = createHmac('sha256', secret).update(body).digest(); const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const session = JSON.parse(Buffer.from(body, 'base64url')); return session.exp > now && session.email === email ? session : null;
  } catch { return null; }
}
export function sessionToken(request) { return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('sm_session='))?.slice(11) || ''; }
