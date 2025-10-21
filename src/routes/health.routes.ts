import { Router } from 'express';
import { ok } from '../utils/response';
const r = Router();
r.get('/', (_req, res) => res.json(ok('Service healthy', { date: new Date().toISOString() })));
export default r;
