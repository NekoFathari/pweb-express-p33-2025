import { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/response';
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  res.status(err.status ?? 500).json(fail(err.message ?? 'Internal Server Error'));
}
