import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

interface TransactionItem {
  bookId: string;
  quantity: number;
}

export const createTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const { items }: { items: TransactionItem[] } = req.body;
    const userId = req.user.id;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendResponse(res, 400, false, 'Items are required and must be a non-empty array');
    }

    for (const item of items) {
      if (!item.bookId || !item.quantity || item.quantity < 1) {
        return sendResponse(res, 400, false, 'Each item must have valid bookId and quantity (min 1)');
      }
    }

    // Database transaction
    const result = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const transactionDetails = [];

      for (const item of items) {
        const book = await tx.book.findUnique({
          where: { id: item.bookId },
          include: { genre: true }
        });

        if (!book) {
          throw new Error(`BOOK_NOT_FOUND:${item.bookId}`);
        }

        if (book.stock < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${book.title}:${book.stock}:${item.quantity}`);
        }

        // Update stock
        await tx.book.update({
          where: { id: item.bookId },
          data: { stock: { decrement: item.quantity } }
        });

        const itemTotal = book.price * item.quantity;
        totalAmount += itemTotal;

        transactionDetails.push({
          bookId: item.bookId,
          quantity: item.quantity,
          priceAtPurchase: book.price
        });
      }

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          userId,
          totalAmount,
          details: {
            create: transactionDetails
          }
        },
        include: {
          details: {
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

      return transaction;
    });

    return sendResponse(res, 201, true, 'Transaction created successfully', result);

  } catch (error: any) {
    console.error('Transaction error:', error);

    if (error.message.startsWith('BOOK_NOT_FOUND')) {
      const bookId = error.message.split(':')[1];
      return sendResponse(res, 404, false, `Book with ID ${bookId} not found`);
    }

    if (error.message.startsWith('INSUFFICIENT_STOCK')) {
      const [, title, available, requested] = error.message.split(':');
      return sendResponse(res, 400, false, `Insufficient stock for "${title}". Available: ${available}, Requested: ${requested}`);
    }

    return sendResponse(res, 500, false, 'Internal server error');
  }
};

export const getAllTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const transactions = await prisma.transaction.findMany({
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        details: {
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
        createdAt: 'desc'
      }
    });

    const total = await prisma.transaction.count();

    return sendResponse(res, 200, true, 'Transactions retrieved successfully', {
      transactions,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    return sendResponse(res, 500, false, 'Internal server error');
  }
};

export const getTransactionDetail = async (req: AuthRequest, res: Response) => {
  try {
    const { transaction_id } = req.params;

    const transaction = await prisma.transaction.findUnique({
      where: { id: transaction_id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        details: {
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

    if (!transaction) {
      return sendResponse(res, 404, false, 'Transaction not found');
    }

    return sendResponse(res, 200, true, 'Transaction details retrieved successfully', transaction);

  } catch (error) {
    console.error('Get transaction detail error:', error);
    return sendResponse(res, 500, false, 'Internal server error');
  }
};

export const getTransactionStatistics = async (req: AuthRequest, res: Response) => {
  try {
    // Total transactions & average amount
    const transactionStats = await prisma.transaction.aggregate({
      _count: {
        id: true
      },
      _avg: {
        totalAmount: true
      },
      _sum: {
        totalAmount: true
      }
    });

    // Get all transaction details with book and genre info
    const transactionDetails = await prisma.transactionDetail.findMany({
      include: {
        book: {
          include: {
            genre: true
          }
        }
      }
    });

    // Aggregate by genre
    const genreStats: { [genreId: string]: { genreName: string; totalSold: number; totalRevenue: number } } = {};

    transactionDetails.forEach(detail => {
      const genreId = detail.book.genreId;
      const genreName = detail.book.genre.name;
      
      if (!genreStats[genreId]) {
        genreStats[genreId] = {
          genreName,
          totalSold: 0,
          totalRevenue: 0
        };
      }
      
      genreStats[genreId].totalSold += detail.quantity;
      genreStats[genreId].totalRevenue += detail.quantity * detail.priceAtPurchase;
    });

    const genreArray = Object.values(genreStats);
    
    // Find genre with most and least sales
    const genreWithMostSales = genreArray.length > 0 
      ? genreArray.reduce((max, genre) => genre.totalSold > max.totalSold ? genre : max)
      : { genreName: "No data", totalSold: 0, totalRevenue: 0 };

    const genreWithLeastSales = genreArray.length > 0 
      ? genreArray.reduce((min, genre) => genre.totalSold < min.totalSold ? genre : min)
      : { genreName: "No data", totalSold: 0, totalRevenue: 0 };

    const statistics = {
      totalTransactions: transactionStats._count.id,
      totalRevenue: transactionStats._sum.totalAmount || 0,
      averageTransactionAmount: Math.round(transactionStats._avg.totalAmount || 0),
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

    return sendResponse(res, 200, true, 'Statistics retrieved successfully', statistics);

  } catch (error) {
    console.error('Get statistics error:', error);
    return sendResponse(res, 500, false, 'Internal server error');
  }
};
