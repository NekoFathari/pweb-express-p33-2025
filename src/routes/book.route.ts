import { Router } from 'express';
import {
  createBook,
  getBooks,
  getBookById,
  getBooksByGenre,
  updateBook,
  deleteBook
} from '../controllers/book.controller';
import { authGuard } from '../middlewares/auth';

const router = Router();

// Semua endpoint wajib authenticate
router.post('/', authGuard, createBook);
router.get('/', authGuard, getBooks);
router.get('/:book_id', authGuard, getBookById);
router.get('/genre/:genre_id', authGuard, getBooksByGenre);
router.patch('/:book_id', authGuard, updateBook);
router.delete('/:book_id', authGuard, deleteBook);

export default router;
