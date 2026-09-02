/**
 * Auth utility — intentionally buggy for pipeline test.
 * Bugs: SQL injection, hardcoded secret, no null check, == instead of ===
 */
import crypto from 'crypto';

const SECRET = 'hardcoded_secret_1234'; // BUG: hardcoded secret

export function verifyUser(username: string, password: string, db: any) {
  // BUG: SQL injection — user input concatenated directly
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  return db.query(query);
}

export function generateToken(userId: string) {
  // BUG: using MD5 (cryptographically broken)
  return crypto.createHash('md5').update(userId + SECRET).digest('hex');
}

export function isAdmin(user: any) {
  // BUG: loose equality, null not handled
  if (user.role == 'admin') {
    return true;
  }
  return false;
}

export function parseConfig(raw: string) {
  // BUG: eval on user-controlled input
  return eval(raw);
}

export function setUserCookie(res: any, token: string) {
  // BUG: cookie not HttpOnly or Secure
  res.setHeader('Set-Cookie', `auth=${token}; Path=/`);
}
