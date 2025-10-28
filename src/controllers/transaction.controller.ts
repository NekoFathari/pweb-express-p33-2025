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

      // Quantity tidak boleh float
      if (!Number.isInteger(item.quantity)) {
        return res.status(422).json(fail(`Quantity must be integer (not float) for item at index ${i}`));
      }

      // Quantity tidak boleh negatif
      if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity < 1) {
        return res.status(422).json(fail(`Invalid quantity for item at index ${i} (must be integer >= 1)`));
      }
    }

    // Database transaction - FIXED untuk schema yang benar
    const result = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const transactionDetails = [];

      for (const item of items) {
        const book = await tx.book.findUnique({
          where: { 
            id: item.book_id
          },
          include: { genre: true }
        });

        if (!book) {
          throw new Error(`BOOK_NOT_FOUND:${item.book_id}`);
        }

        if (book.stock < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${book.title}:${book.stock}:${item.quantity}`);
        }

        // Update stock - FIXED field name
        await tx.book.update({
          where: { id: item.book_id },
          data: { stock: { decrement: item.quantity } }
        });

        const itemTotal = book.price * item.quantity;
        totalAmount += itemTotal;

        transactionDetails.push({
          bookId: item.book_id, // FIXED field mapping
          quantity: item.quantity,
          priceAtPurchase: book.price // Price snapshot
        });
      }

      // Create transaction - FIXED untuk schema Transaction
      const transaction = await tx.transaction.create({
        data: {
          userId: userId,
          totalAmount: totalAmount, // Total amount calculation
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
          },
          user: {
            select: {
              id: true,
              name: true, // FIXED: field name dari schema
              email: true
            }
          }
        }
      });

      return transaction;
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
    // Support semua params
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Filter by user_id
    const userId = req.query.user_id as string;
    
    // Sort options
    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = req.query.sortOrder as string || 'desc';

    // Build where condition
    const where: any = {};
    if (userId) {
      where.userId = userId;
    }

    // Validate sort fields
    const validSortFields = ['createdAt', 'totalAmount'];
    const validSortOrders = ['asc', 'desc'];
    
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const finalSortOrder = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';

    // FIXED: Gunakan Transaction bukan Orders
    const transactions = await prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true, // FIXED: field name
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
        [finalSortBy]: finalSortOrder
      }
    });

    const total = await prisma.transaction.count({ where });

    return res.json(ok('Transactions retrieved successfully', {
      transactions, // FIXED: return transactions bukan orders
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        sort_by: finalSortBy,
        sort_order: finalSortOrder,
        filters: {
          user_id: userId || 'all'
        }
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

    // FIXED: Gunakan Transaction bukan Orders
    const transaction = await prisma.transaction.findUnique({
      where: { id: transaction_id },
      include: {
        user: {
          select: {
            id: true,
            name: true, // FIXED: field name
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
      return res.status(404).json(fail('Transaction not found'));
    }

    return res.json(ok('Transaction details retrieved successfully', transaction));

  } catch (error) {
    console.error('Get transaction detail error:', error);
    return res.status(500).json(fail('Internal server error'));
  }
};

export const getTransactionStatistics = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ ADDED: Date range filter (optional)
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter = {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) })
        }
      };
      
      // Validate dates
      if (startDate && isNaN(new Date(startDate).getTime())) {
        return res.status(400).json(fail('Invalid startDate format'));
      }
      if (endDate && isNaN(new Date(endDate).getTime())) {
        return res.status(400).json(fail('Invalid endDate format'));
      }
    }

    // Total transactions - FIXED: Gunakan Transaction
    const transactionStats = await prisma.transaction.aggregate({
      where: dateFilter,
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

    // Get all transaction details - FIXED: Gunakan TransactionDetail
    const transactionDetails = await prisma.transactionDetail.findMany({
      where: {
        transaction: dateFilter
      },
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

    transactionDetails.forEach(detail => {
      const genreId = detail.book.genreId;
      const genreName = detail.book.genre.name;
      const itemRevenue = detail.quantity * detail.priceAtPurchase; // FIXED: Use priceAtPurchase
      
      totalRevenue += itemRevenue;

      if (!genreStats[genreId]) {
        genreStats[genreId] = {
          genreName,
          totalSold: 0,
          totalRevenue: 0
        };
      }
      
      genreStats[genreId].totalSold += detail.quantity;
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

    const statistics = {
      totalTransactions: transactionStats._count.id,
      totalRevenue: transactionStats._sum.totalAmount || 0, // Use aggregated total
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

    return res.json(ok('Statistics retrieved successfully', statistics));

  } catch (error) {
    console.error('Get statistics error:', error);
    return res.status(500).json(fail('Internal server error'));
  }
};
