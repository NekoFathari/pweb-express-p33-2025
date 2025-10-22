import { Router } from 'express';
import {
  createBook,
  getBooks,
  getBookById,
  getBooksByGenre,
  updateBook,
  deleteBook
} from '../controllers/book.controller';

const router = Router();

router.post('/', createBook);
router.get('/', getBooks);
router.get('/:book_id', getBookById);
router.get('/genre/:genre_id', getBooksByGenre);
router.patch('/:book_id', updateBook);
router.delete('/:book_id', deleteBook);

export default router;
