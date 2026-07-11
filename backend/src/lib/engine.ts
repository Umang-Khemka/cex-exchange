import { prisma } from "./db.js";
import { store } from "./store.js";
import type { OrderSide, OrderType, TradeResult, MatchedFill, OrderStatus } from "../types/index.js";
import { CandleService } from "./candle.js"; // add this import at top

export class MatchingEngine {
  static async processOrder(params: {
    orderId:    number;
    userId:     number;
    market:     string;
    baseAsset:  string;
    quoteAsset: string;
    price:      number;
    qty:        number;
    type:       OrderType;
    side:       OrderSide;
  }): Promise<TradeResult> {
    const { orderId, userId, market, baseAsset, quoteAsset, price, qty, type, side } = params;

    const ob             = store.getOrderbook(market);
    const fills:          MatchedFill[] = [];
    let   filledQty      = 0;
    let   remainingQty   = qty;
    const opposingSide   = side === "BUY" ? ob.asks : ob.bids;

    while (remainingQty > 0 && opposingSide.length > 0) {
      const best = opposingSide[0];

      // limit order — only match if price is acceptable
      if (type === "LIMIT") {
        if (side === "BUY"  && best.price > price) break;
        if (side === "SELL" && best.price < price) break;
      }

      const fillQty   = Math.min(remainingQty, best.qty);
      const fillPrice = best.price; // maker's price always wins

      fills.push({
        price:        fillPrice,
        qty:          fillQty,
        makerOrderId: best.orderId,
        makerUserId:  best.userId,
        takerOrderId: orderId,
        takerUserId:  userId,
      });

      best.qty     -= fillQty;
      remainingQty -= fillQty;
      filledQty    += fillQty;

      store.setLastTradedPrice(market, fillPrice);
      store.setLastTradedPrice(market, fillPrice);
      await CandleService.updateCandles(market, fillPrice, fillQty); // add this line

      // update maker order in DB
      if (best.qty <= 0) {
        opposingSide.shift(); // remove fully filled maker from book
        await prisma.order.update({
          where: { id: best.orderId },
          data:  { status: "FILLED", filledQty: { increment: fillQty } },
        });
      } else {
        await prisma.order.update({
          where: { id: best.orderId },
          data:  { filledQty: { increment: fillQty }, status: "PARTIALLY_FILLED" },
        });
      }
    }

    // determine taker order status
    let status: OrderStatus = "OPEN";
    if (remainingQty === 0)      status = "FILLED";
    else if (filledQty > 0)      status = "PARTIALLY_FILLED";

    // persist fills to DB first, then settle RAM
    if (fills.length > 0) {
      await this.persistFills(fills, market);

      // settle balances in RAM after DB write (safer)
      for (const fill of fills) {
        const buyerUserId  = side === "BUY" ? userId : fill.makerUserId;
        const sellerUserId = side === "BUY" ? fill.makerUserId : userId;
        store.settleTrade(buyerUserId, sellerUserId, baseAsset, quoteAsset, fill.qty, fill.price);
      }
    }

    // if limit order not fully filled → add remainder to book
    if (type === "LIMIT" && remainingQty > 0) {
      const level = { orderId, userId, price, qty: remainingQty };
      if (side === "BUY") store.addBid(market, level);
      else                store.addAsk(market, level);
    }

    // update taker order in DB
    await prisma.order.update({
      where: { id: orderId },
      data:  { status, filledQty: { increment: filledQty } },
    });

    return { filledQty, remainingQty, fills, status };
  }

  private static async persistFills(fills: MatchedFill[], asset: string) {
    const rows = fills.flatMap((f) => [
      {
        qty: f.qty, price: f.price,
        side: "SELL" as const, fillType: "MAKER" as const,
        userId: f.makerUserId, asset, originalOrderId: f.makerOrderId,
      },
      {
        qty: f.qty, price: f.price,
        side: "BUY" as const, fillType: "TAKER" as const,
        userId: f.takerUserId, asset, originalOrderId: f.takerOrderId,
      },
    ]);
    await prisma.fill.createMany({ data: rows });
  }
}