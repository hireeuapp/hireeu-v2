import { createSessionToken, loginUser, setSessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
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
