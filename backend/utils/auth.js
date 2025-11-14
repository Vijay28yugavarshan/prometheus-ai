import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || 'prometheus-secret';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';

export function generateAdminToken() {
  return jwt.sign({ user: ADMIN_USER }, ADMIN_SECRET, { expiresIn: '12h' });
}

export function verifyAdminToken(token) {
  try {
    return jwt.verify(token, ADMIN_SECRET);
  } catch (e) {
    return null;
  }
}

export function adminMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  const payload = verifyAdminToken(token);
  if (!payload) return res.status(403).json({ error: 'invalid token' });
  req.admin = payload;
  next();
}
