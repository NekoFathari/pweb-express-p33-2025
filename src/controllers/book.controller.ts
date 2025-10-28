import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ok, fail } from '../utils/response';

const prisma = new PrismaClient();

// POST /books - Create book with duplicate title validation
export const createBook = async (req: Request, res: Response) => {
  try {
    const { title, writer, publisher, publication_year, description, price, stock_quantity, genre_id } = req.body;

    // Validasi publication_year tidak boleh lebih dari tahun sekarang
    const currentYear = new Date().getFullYear();
    if (publication_year > currentYear) {
      return res.status(422).json(fail(`Publication year cannot be greater than ${currentYear}`));
    }

    // Validasi price tidak boleh negatif
    if (price < 0) {
      return res.status(422).json(fail('Price cannot be negative'));
    }

    // Validasi stock_quantity harus integer
    if (!Number.isInteger(stock_quantity)) {
      return res.status(422).json(fail('Stock quantity must be an integer'));
    }

    // Validasi stock_quantity tidak boleh negatif
    if (stock_quantity < 0) {
      return res.status(422).json(fail('Stock quantity cannot be negative'));
    }

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
      search,
      orderByTitle,
      orderByPublishDate
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const where: any = {
      deleted_at: null
    };

    // Search filter (berlaku untuk title, writer, publisher)
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { writer: { contains: search as string, mode: 'insensitive' } },
        { publisher: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Build orderBy
    const orderBy: any[] = [];
    
    if (orderByTitle) {
      orderBy.push({ title: orderByTitle === 'asc' ? 'asc' : 'desc' });
    }
    
    if (orderByPublishDate) {
      orderBy.push({ publication_year: orderByPublishDate === 'asc' ? 'asc' : 'desc' });
    }

    // Default order by created_at if no order specified
    if (orderBy.length === 0) {
      orderBy.push({ created_at: 'desc' });
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
      orderBy
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
    const { 
      page = '1', 
      limit = '10',
      search,
      orderByTitle,
      orderByPublishDate
    } = req.query;

    // Validasi genre exists
    const genre = await prisma.genres.findUnique({
      where: { id: genre_id }
    });

    if (!genre) {
      return res.status(404).json(fail('Genre not found'));
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      genre_id,
      deleted_at: null
    };

    // Search filter
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { writer: { contains: search as string, mode: 'insensitive' } },
        { publisher: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Build orderBy
    const orderBy: any[] = [];
    
    if (orderByTitle) {
      orderBy.push({ title: orderByTitle === 'asc' ? 'asc' : 'desc' });
    }
    
    if (orderByPublishDate) {
      orderBy.push({ publication_year: orderByPublishDate === 'asc' ? 'asc' : 'desc' });
    }

    if (orderBy.length === 0) {
      orderBy.push({ created_at: 'desc' });
    }

    const total = await prisma.books.count({ where });

    const books = await prisma.books.findMany({
      where,
      include: {
        genre: true
      },
      skip,
      take: limitNum,
      orderBy
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

    // Validasi publication_year jika diupdate
    if (updateData.publication_year !== undefined) {
      const currentYear = new Date().getFullYear();
      if (updateData.publication_year > currentYear) {
        return res.status(422).json(fail(`Publication year cannot be greater than ${currentYear}`));
      }
    }

    // Validasi price jika diupdate
    if (updateData.price !== undefined && updateData.price < 0) {
      return res.status(422).json(fail('Price cannot be negative'));
    }

    // Validasi stock_quantity jika diupdate
    if (updateData.stock_quantity !== undefined) {
      if (!Number.isInteger(updateData.stock_quantity)) {
        return res.status(422).json(fail('Stock quantity must be an integer'));
      }
      if (updateData.stock_quantity < 0) {
        return res.status(422).json(fail('Stock quantity cannot be negative'));
      }
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
