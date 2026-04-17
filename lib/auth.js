import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const COOKIE_NAME = 'hireeu_session';

function getJwtSecret() {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured');
  }
  return secret;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const pairs = header.split(';').map((p) => p.trim()).filter(Boolean);
  const out = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function signSession(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

function verifySession(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export async function registerUser({ email, password, name }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await query('SELECT id FROM app_users WHERE email = $1', [normalizedEmail]);
  if (existing.rowCount > 0) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();
  const result = await query(
    `INSERT INTO app_users (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name`,
    [id, normalizedEmail, passwordHash, name?.trim() || null]
  );

  return result.rows[0];
}

export async function loginUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await query(
    'SELECT id, email, name, password_hash FROM app_users WHERE email = $1',
    [normalizedEmail]
  );
  if (result.rowCount === 0) {
    throw new Error('Invalid email or password');
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  return { id: user.id, email: user.email, name: user.name };
}

export function createSessionToken(user) {
  return signSession({
    sub: user.id,
    email: user.email,
    name: user.name || null,
  });
}

export async function requireAuth(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const payload = verifySession(token);
  if (!payload?.sub) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }

  // Verify user still exists in DB (important if DB was reset)
  const result = await query('SELECT id FROM app_users WHERE id = $1', [payload.sub]);
  if (result.rowCount === 0) {
    clearSessionCookie(res);
    res.status(401).json({ error: 'Session expired or user deleted' });
    return null;
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name || null,
  };
}
