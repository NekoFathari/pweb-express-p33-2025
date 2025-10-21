import { Router } from 'express';
import * as c from '../controllers/auth.controller';
import { authGuard } from '../middlewares/auth';
const r = Router();
r.post('/register', c.register);
r.post('/login', c.login);
r.get('/me', authGuard, c.me);
export default r;
