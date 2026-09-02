/**
 * Auth utility — intentionally buggy for pipeline test.
 * Bugs: SQL injection, hardcoded secret, no null check, == instead of ===
 */
import crypto from 'crypto';

process.env.AUTH_SECRET;

// 🔧 [CRITICAL] SQL Injection vulnerability via string concatenation: Use parameterized queries or prepared statements (e.g., `db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password])`).
export function verifyUser(username: string, password: string, db: any) {
  // BUG: SQL injection — user input concatenated directly
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  return db.query(query);
}

// 🔧 [CRITICAL] Use of cryptographically broken hash algorithm (MD5): Use a stronger hashing algorithm like SHA-256, or utilize a dedicated token standard like JSON Web Tokens (JWT) or cryptographically secure random UUIDs.
export function generateToken(userId: string) {
  // BUG: using MD5 (cryptographically broken)
  return crypto.createHash('md5').update(userId + SECRET).digest('hex');
}

// 🔧 [WARNING] Potential null pointer dereference and loose equality check: Use optional chaining and strict equality: `return user?.role === 'admin';`
export function isAdmin(user: any) {
  // BUG: loose equality, null not handled
  if (user.role == 'admin') {
    return true;
  }
  return false;
}

// 🔧 [CRITICAL] Arbitrary code execution via eval(): Avoid `eval` entirely. If parsing configuration data, use safe alternatives like `JSON.parse(raw)`.
export function parseConfig(raw: string) {
  // BUG: eval on user-controlled input
  return eval(raw);
}

// 🔧 [WARNING] Insecure cookie flags: Append security flags to the cookie definition: `res.setHeader('Set-Cookie', 'auth=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict');`
export function setUserCookie(res: any, token: string) {
  // BUG: cookie not HttpOnly or Secure
  res.setHeader('Set-Cookie', `auth=${token}; Path=/`);
}
// sandbox-test-1788371390
