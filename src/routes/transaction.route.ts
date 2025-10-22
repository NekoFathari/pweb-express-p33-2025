import { Router } from 'express';
import {
  createTransaction,
  getAllTransactions,
  getTransactionDetail,
  getTransactionStatistics
} from '../controllers/transaction.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', createTransaction);
router.get('/', getAllTransactions);
router.get('/statistics', getTransactionStatistics);
router.get('/:transaction_id', getTransactionDetail);

export default router;
