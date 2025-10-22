import { Router } from 'express';
import {
  createBook,
  getBooks,
  getBookById,
  getBooksByGenre,
  updateBook,
  deleteBook
} from '../controllers/book.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Semua endpoint wajib authenticate
router.post('/', authenticate, createBook);
router.get('/', authenticate, getBooks);
router.get('/:book_id', authenticate, getBookById);
router.get('/genre/:genre_id', authenticate, getBooksByGenre);
router.patch('/:book_id', authenticate, updateBook);
router.delete('/:book_id', authenticate, deleteBook);

export default router;
