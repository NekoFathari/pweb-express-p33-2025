import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import genreRoutes from './routes/genre.routes';
import bookRoutes from './routes/book.route';
import transactionRoutes from './routes/transaction.route';
import { errorHandler } from './middlewares/error';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/health-check', healthRoutes);
app.use('/auth', authRoutes);
app.use('/genre', genreRoutes);
app.use('/books', bookRoutes);
app.use('/transactions', transactionRoutes);

app.use(errorHandler);
export default app;
