import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ok, fail } from '../utils/response';

interface AuthRequest extends Request {
  user: {
    id: string;
    [key: string]: any;
  };
}

const prisma = new PrismaClient();

interface TransactionItem {
  book_id: string;
  quantity: number;
}

export const createTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const { items }: { items: TransactionItem[] } = req.body;
    const userId = req.user.id;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json(fail('Items are required and must be a non-empty array'));
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (!item.book_id || typeof item.book_id !== 'string' || item.book_id.trim() === '') {
        return res.status(400).json(fail(`Invalid book_id for item at index ${i}`));
      }

      if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity < 1) {
        return res.status(400).json(fail(`Invalid quantity for item at index ${i} (must be a number >= 1)`));
      }
    }

    // Database transaction
    const result = await prisma.$transaction(async (tx) => {
      const orderItems = [];

      for (const item of items) {
        const book = await tx.books.findFirst({
          where: { 
            id: item.book_id,
            deleted_at: null
          },
          include: { genre: true }
        });

        if (!book) {
          throw new Error(`BOOK_NOT_FOUND:${item.book_id}`);
        }

        if (book.stock_quantity < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${book.title}:${book.stock_quantity}:${item.quantity}`);
        }

        // Update stock
        await tx.books.update({
          where: { id: item.book_id },
          data: { stock_quantity: { decrement: item.quantity } }
        });

        orderItems.push({
          book_id: item.book_id,
          quantity: item.quantity
        });
      }

      // Create order
      const order = await tx.orders.create({
        data: {
          user_id: userId,
          order_items: {
            create: orderItems
          }
        },
        include: {
          order_items: {
            include: {
              book: {
                include: {
                  genre: true
                }
              }
            }
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      });

      return order;
    });

    return res.status(201).json(ok('Transaction created successfully', result));

  } catch (error: any) {
    console.error('Transaction error:', error);

    if (error.message.startsWith('BOOK_NOT_FOUND')) {
      const bookId = error.message.split(':')[1];
      return res.status(404).json(fail(`Book with ID ${bookId} not found`));
    }

    if (error.message.startsWith('INSUFFICIENT_STOCK')) {
      const [, title, available, requested] = error.message.split(':');
      return res.status(400).json(fail(`Insufficient stock for "${title}". Available: ${available}, Requested: ${requested}`));
    }

    return res.status(500).json(fail('Internal server error'));
  }
};

export const getAllTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const orders = await prisma.orders.findMany({
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        order_items: {
          include: {
            book: {
              include: {
                genre: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    const total = await prisma.orders.count();

    return res.json(ok('Transactions retrieved successfully', {
      orders,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }));

  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json(fail('Internal server error'));
  }
};

export const getTransactionDetail = async (req: AuthRequest, res: Response) => {
  try {
    const { transaction_id } = req.params;

    const order = await prisma.orders.findUnique({
      where: { id: transaction_id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        order_items: {
          include: {
            book: {
              include: {
                genre: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json(fail('Transaction not found'));
    }

    return res.json(ok('Transaction details retrieved successfully', order));

  } catch (error) {
    console.error('Get transaction detail error:', error);
    return res.status(500).json(fail('Internal server error'));
  }
};

export const getTransactionStatistics = async (req: AuthRequest, res: Response) => {
  try {
    // Total orders
    const totalOrders = await prisma.orders.count();

    // Get all order items with book and genre info
    const orderItems = await prisma.order_items.findMany({
      include: {
        book: {
          include: {
            genre: true
          }
        }
      }
    });

    // Calculate total revenue and aggregate by genre
    let totalRevenue = 0;
    const genreStats: { [genreId: string]: { genreName: string; totalSold: number; totalRevenue: number } } = {};

    orderItems.forEach(item => {
      const genreId = item.book.genre_id;
      const genreName = item.book.genre.name;
      const itemRevenue = item.quantity * item.book.price;
      
      totalRevenue += itemRevenue;

      if (!genreStats[genreId]) {
        genreStats[genreId] = {
          genreName,
          totalSold: 0,
          totalRevenue: 0
        };
      }
      
      genreStats[genreId].totalSold += item.quantity;
      genreStats[genreId].totalRevenue += itemRevenue;
    });

    const genreArray = Object.values(genreStats);
    
    // Find genre with most and least sales
    const genreWithMostSales = genreArray.length > 0 
      ? genreArray.reduce((max, genre) => genre.totalSold > max.totalSold ? genre : max)
      : { genreName: "No data", totalSold: 0, totalRevenue: 0 };

    const genreWithLeastSales = genreArray.length > 0 
      ? genreArray.reduce((min, genre) => genre.totalSold < min.totalSold ? genre : min)
      : { genreName: "No data", totalSold: 0, totalRevenue: 0 };

    const averageTransactionAmount = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    const statistics = {
      totalTransactions: totalOrders,
      totalRevenue,
      averageTransactionAmount,
      genreWithMostSales: {
        genreName: genreWithMostSales.genreName,
        totalSold: genreWithMostSales.totalSold,
        totalRevenue: genreWithMostSales.totalRevenue
      },
      genreWithLeastSales: {
        genreName: genreWithLeastSales.genreName,
        totalSold: genreWithLeastSales.totalSold,
        totalRevenue: genreWithLeastSales.totalRevenue
      }
    };

    return res.json(ok('Statistics retrieved successfully', statistics));

  } catch (error) {
    console.error('Get statistics error:', error);
    return res.status(500).json(fail('Internal server error'));
  }
};
