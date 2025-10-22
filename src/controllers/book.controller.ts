import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ok, fail } from '../utils/response';

const prisma = new PrismaClient();

// POST /books - Create book with duplicate title validation
export const createBook = async (req: Request, res: Response) => {
  try {
    const { title, writer, publisher, publication_year, description, price, stock_quantity, genre_id } = req.body;

    // Validasi duplikat judul
    const existingBook = await prisma.books.findFirst({
      where: {
        title,
        deleted_at: null
      }
    });

    if (existingBook) {
      return res.status(400).json(fail('Book with this title already exists'));
    }

    // Validasi genre exists
    const genre = await prisma.genres.findUnique({
      where: { id: genre_id }
    });

    if (!genre) {
      return res.status(404).json(fail('Genre not found'));
    }

    const book = await prisma.books.create({
      data: {
        title,
        writer,
        publisher,
        publication_year,
        description,
        price,
        stock_quantity,
        genre_id
      },
      include: {
        genre: true
      }
    });

    res.status(201).json(ok('Book created successfully', book));
  } catch (error) {
    res.status(500).json(fail('Failed to create book'));
  }
};

// GET /books - Get all books with filter and pagination
export const getBooks = async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      title,
      writer,
      publisher,
      genre_id,
      min_price,
      max_price,
      min_year,
      max_year,
      sort_by = 'created_at',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const where: any = {
      deleted_at: null
    };

    if (title) {
      where.title = { contains: title as string, mode: 'insensitive' };
    }

    if (writer) {
      where.writer = { contains: writer as string, mode: 'insensitive' };
    }

    if (publisher) {
      where.publisher = { contains: publisher as string, mode: 'insensitive' };
    }

    if (genre_id) {
      where.genre_id = genre_id as string;
    }

    if (min_price || max_price) {
      where.price = {};
      if (min_price) where.price.gte = parseFloat(min_price as string);
      if (max_price) where.price.lte = parseFloat(max_price as string);
    }

    if (min_year || max_year) {
      where.publication_year = {};
      if (min_year) where.publication_year.gte = parseInt(min_year as string);
      if (max_year) where.publication_year.lte = parseInt(max_year as string);
    }

    // Get total count
    const total = await prisma.books.count({ where });

    // Get books with pagination
    const books = await prisma.books.findMany({
      where,
      include: {
        genre: true
      },
      skip,
      take: limitNum,
      orderBy: {
        [sort_by as string]: order as 'asc' | 'desc'
      }
    });

    res.json(ok('Books retrieved successfully', {
      books,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum)
      }
    }));
  } catch (error) {
    res.status(500).json(fail('Failed to fetch books'));
  }
};

// GET /books/:book_id - Get single book
export const getBookById = async (req: Request, res: Response) => {
  try {
    const { book_id } = req.params;

    const book = await prisma.books.findFirst({
      where: {
        id: book_id,
        deleted_at: null
      },
      include: {
        genre: true
      }
    });

    if (!book) {
      return res.status(404).json(fail('Book not found'));
    }

    res.json(ok('Book retrieved successfully', book));
  } catch (error) {
    res.status(500).json(fail('Failed to fetch book'));
  }
};

// GET /books/genre/:genre_id - Get books by genre
export const getBooksByGenre = async (req: Request, res: Response) => {
  try {
    const { genre_id } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where = {
      genre_id,
      deleted_at: null
    };

    const total = await prisma.books.count({ where });

    const books = await prisma.books.findMany({
      where,
      include: {
        genre: true
      },
      skip,
      take: limitNum,
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json(ok('Books by genre retrieved successfully', {
      books,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum)
      }
    }));
  } catch (error) {
    res.status(500).json(fail('Failed to fetch books by genre'));
  }
};

// PATCH /books/:book_id - Update book (stock and info)
export const updateBook = async (req: Request, res: Response) => {
  try {
    const { book_id } = req.params;
    const updateData = req.body;

    // Check if book exists
    const existingBook = await prisma.books.findFirst({
      where: {
        id: book_id,
        deleted_at: null
      }
    });

    if (!existingBook) {
      return res.status(404).json(fail('Book not found'));
    }

    // Validasi duplikat judul jika title diupdate
    if (updateData.title && updateData.title !== existingBook.title) {
      const duplicateTitle = await prisma.books.findFirst({
        where: {
          title: updateData.title,
          deleted_at: null,
          id: { not: book_id }
        }
      });

      if (duplicateTitle) {
        return res.status(400).json(fail('Book with this title already exists'));
      }
    }

    // Validasi genre jika genre_id diupdate
    if (updateData.genre_id) {
      const genre = await prisma.genres.findUnique({
        where: { id: updateData.genre_id }
      });

      if (!genre) {
        return res.status(404).json(fail('Genre not found'));
      }
    }

    const updatedBook = await prisma.books.update({
      where: { id: book_id },
      data: updateData,
      include: {
        genre: true
      }
    });

    res.json(ok('Book updated successfully', updatedBook));
  } catch (error) {
    res.status(500).json(fail('Failed to update book'));
  }
};

// DELETE /books/:book_id - Soft delete book
export const deleteBook = async (req: Request, res: Response) => {
  try {
    const { book_id } = req.params;

    const book = await prisma.books.findFirst({
      where: {
        id: book_id,
        deleted_at: null
      }
    });

    if (!book) {
      return res.status(404).json(fail('Book not found'));
    }

    // Soft delete
    await prisma.books.update({
      where: { id: book_id },
      data: {
        deleted_at: new Date()
      }
    });

    res.json(ok('Book deleted successfully', { id: book_id }));
  } catch (error) {
    res.status(500).json(fail('Failed to delete book'));
  }
};
