import { createSessionToken, registerUser, setSessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
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
