import { prisma } from '../prisma/client';
export async function create(input: { name: string }) {
  return prisma.genres.create({ data: { name: input.name } });
}
export async function list() {
  return prisma.genres.findMany({ where: { deleted_at: null }, orderBy: { name: 'asc' } });
}
export async function detail(id: string) {
  return prisma.genres.findFirst({ where: { id, deleted_at: null } });
}
export async function update(id: string, input: { name: string }) {
  const duplicate = await prisma.genres.findFirst({
    where: {
      name: input.name,
      deleted_at: null,
      NOT: { id }, // pastikan bukan genre yg sama
    },
  });

  if (duplicate) {
    // lempar error custom, biar controller bisa balikin 400
    const error: any = new Error('Genre name already exists');
    error.code = 'DUPLICATE_GENRE';
    throw error;
  }
  return prisma.genres.update({ where: { id }, data: { name: input.name } });
}
export async function softDelete(id: string) {

  return prisma.genres.update({ where: { id }, data: { deleted_at: new Date() } });
}

