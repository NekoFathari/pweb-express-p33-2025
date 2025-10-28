import { Request, Response } from 'express';
import { z } from 'zod';
import * as svc from '../services/genre.service';
import { ok, fail } from '../utils/response';

const CreateDto = z.object({ name: z.string().min(1) });
const UpdateDto = z.object({ name: z.string().min(1) });

export async function create(req: Request, res: Response) {
  const parsed = CreateDto.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail('Invalid body'));
  try {
    const data = await svc.create(parsed.data);
    res.status(201).json(ok('Genre created', data));
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json(fail('Genre already exists'));
    throw e;
  }
}
export async function list(_req: Request, res: Response) {
  const data = await svc.list();
  res.json(ok('Genres', data));
}
export async function detail(req: Request, res: Response) {
  const data = await svc.detail(req.params.id);
  if (!data) return res.status(404).json(fail('Genre not found'));
  res.json(ok('Genre', data));
}
export async function update(req: Request, res: Response) {
  const parsed = UpdateDto.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(fail('Invalid body'));
  try {
    const data = await svc.update(req.params.id, parsed.data);
    res.json(ok('Genre updated', data));
  } catch (e: any) {
    if (e.code === 'DUPLICATE_GENRE')
      return res.status(400).json(fail('Genre name already exists'));
    throw e; // biar error lain tetap jalan
  }
}
export async function remove(req: Request, res: Response) {
  await svc.softDelete(req.params.id);
  res.json(ok('Genre deleted', { id: req.params.id }));
}
