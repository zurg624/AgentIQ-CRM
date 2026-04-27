'use strict';

/**
 * Auth middleware for AgentIQ.
 *
 * Tokens are produced by POST /api/auth/login as:
 *   base64("username:role:timestamp")
 *
 * decodeUser(req)  → { username, role } | null
 * requireAuth      → 401 if no/invalid token, attaches req.user
 * requireAdmin     → 401 if no/invalid token, 403 if role !== 'admin'
 */

function decodeUser(req) {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (!auth) return null;
  try {
    const [username, role] = Buffer.from(auth, 'base64').toString().split(':');
    if (!username) return null;
    return { username, role: role || 'agent' };
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = decodeUser(req);
  if (!user) return res.status(401).json({ error: 'authentication required' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = decodeUser(req);
  if (!user) {
    return res.status(401).json({ error: 'authentication required' });
  }
  if (user.role !== 'admin') {
    console.warn(`[auth] admin route blocked for user="${user.username}" role="${user.role}"`);
    return res.status(403).json({ error: 'admin access required' });
  }
  req.user = user;
  next();
}

module.exports = { decodeUser, requireAuth, requireAdmin };
