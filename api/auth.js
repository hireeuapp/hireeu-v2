import { createSessionToken, loginUser, registerUser, setSessionCookie, clearSessionCookie, requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  const { action } = req.query;

  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    try {
      const user = await loginUser({ email, password });
      const token = createSessionToken(user);
      setSessionCookie(res, token);
      return res.status(200).json({ user });
    } catch (err) {
      return res.status(401).json({ error: err.message || 'Invalid login' });
    }
  }

  if (action === 'register') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    try {
      const user = await registerUser({ email, password, name });
      const token = createSessionToken(user);
      setSessionCookie(res, token);
      return res.status(201).json({ user });
    } catch (err) {
      const message = err.message || 'Registration failed';
      const status = message.includes('already') ? 409 : 500;
      return res.status(status).json({ error: message });
    }
  }

  if (action === 'logout') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (action === 'session') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const user = await requireAuth(req, res);
    if (!user) return;
    return res.status(200).json({ user });
  }

  return res.status(404).json({ error: 'Auth action not found' });
}
