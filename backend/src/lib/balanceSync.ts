import { prisma } from "./db.js";

export class BalanceSync {
  // call when order is placed → lock funds in DB
  static async lockFunds(userId: number, asset: string, amount: number) {
    await prisma.balance.update({
      where: { userId_asset: { userId, asset } },
      data: {
        available: { decrement: amount },
        locked:    { increment: amount },
      },
    });
  }

  // call when order is cancelled → unlock funds in DB
  static async unlockFunds(userId: number, asset: string, amount: number) {
    await prisma.balance.update({
      where: { userId_asset: { userId, asset } },
      data: {
        available: { increment: amount },
        locked:    { decrement: amount },
      },
    });
  }

  // call after fill settles → move funds between buyer and seller in DB
  static async settleTrade(
    buyerUserId:  number,
    sellerUserId: number,
    baseAsset:    string,   // "SOL"
    quoteAsset:   string,   // "USD"
    qty:          number,
    price:        number
  ) {
    const totalCost = qty * price;

    await Promise.all([
      // buyer: locked USD decreases
      prisma.balance.update({
        where: { userId_asset: { userId: buyerUserId, asset: quoteAsset } },
        data:  { locked: { decrement: totalCost } },
      }),
      // buyer: SOL available increases
      prisma.balance.upsert({
        where:  { userId_asset: { userId: buyerUserId, asset: baseAsset } },
        update: { available: { increment: qty } },
        create: { userId: buyerUserId, asset: baseAsset, available: qty, locked: 0 },
      }),
      // seller: locked SOL decreases
      prisma.balance.update({
        where: { userId_asset: { userId: sellerUserId, asset: baseAsset } },
        data:  { locked: { decrement: qty } },
      }),
      // seller: USD available increases
      prisma.balance.upsert({
        where:  { userId_asset: { userId: sellerUserId, asset: quoteAsset } },
        update: { available: { increment: totalCost } },
        create: { userId: sellerUserId, asset: quoteAsset, available: totalCost, locked: 0 },
      }),
    ]);
  }
}