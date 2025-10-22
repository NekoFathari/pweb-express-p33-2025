import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { fail } from '../utils/response';
export function authGuard(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;
  if (!hdr?.startsWith('Bearer ')) return res.status(401).json(fail('Authentication required. Please login first.'));
  try {
    const token = hdr.split(' ')[1];
    (req as any).user = jwt.verify(token, process.env.JWT_SECRET!);
    next();
  } catch { return res.status(401).json(fail('Invalid token')); }
}
