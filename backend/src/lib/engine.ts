import { prisma }        from "./db.js";
import { store }         from "./store.js";
import { CandleService } from "./candle.js";
import { BalanceSync }   from "./balanceSync.js";
import { wsManager }     from "./websocket.js";
import type { OrderSide, OrderType, TradeResult, MatchedFill, OrderStatus } from "../types/index.js";

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

    const ob           = store.getOrderbook(market);
    const fills:        MatchedFill[] = [];
    let   filledQty    = 0;
    let   remainingQty = qty;
    const opposingSide = side === "BUY" ? ob.asks : ob.bids;

    // ── Matching loop ─────────────────────────────────────────
    while (remainingQty > 0 && opposingSide.length > 0) {
      const best = opposingSide[0];

      if (type === "LIMIT") {
        if (side === "BUY"  && best.price > price) break;
        if (side === "SELL" && best.price < price) break;
      }

      const fillQty   = Math.min(remainingQty, best.qty);
      const fillPrice = best.price;

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

      // update last traded price + candles on every fill
      store.setLastTradedPrice(market, fillPrice);
      await CandleService.updateCandles(market, fillPrice, fillQty);

      // update maker order in DB
      if (best.qty <= 0) {
        opposingSide.shift();
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

    // ── Determine taker status ────────────────────────────────
    let status: OrderStatus = "OPEN";
    if (remainingQty === 0) status = "FILLED";
    else if (filledQty > 0) status = "PARTIALLY_FILLED";

    // ── Persist fills to DB first, then settle RAM + broadcast ─
    if (fills.length > 0) {
      // 1. DB write first (crash safety)
      await this.persistFills(fills, market);

      // 2. settle RAM + sync DB balances + broadcast per fill
      for (const fill of fills) {
        const buyerUserId  = side === "BUY" ? userId : fill.makerUserId;
        const sellerUserId = side === "BUY" ? fill.makerUserId : userId;

        // RAM
        store.settleTrade(buyerUserId, sellerUserId, baseAsset, quoteAsset, fill.qty, fill.price);

        // DB balance sync
        await BalanceSync.settleTrade(buyerUserId, sellerUserId, baseAsset, quoteAsset, fill.qty, fill.price);

        // broadcast trade to all market subscribers
        wsManager.broadcastTrade(market, {
          price: fill.price,
          qty:   fill.qty,
          side,
          ts:    Date.now(),
        });

        // push balance update to each user personally
        wsManager.sendBalanceUpdate(buyerUserId,  { asset: baseAsset,  ...store.getBalance(buyerUserId,  baseAsset)  });
        wsManager.sendBalanceUpdate(sellerUserId, { asset: quoteAsset, ...store.getBalance(sellerUserId, quoteAsset) });
      }

      // 3. broadcast updated orderbook to all market subscribers
      const ob = store.getOrderbook(market);
      wsManager.broadcastOrderbook(market, {
        bids:            ob.bids.slice(0, 20),
        asks:            ob.asks.slice(0, 20),
        lastTradedPrice: ob.lastTradedPrice,
      });
    }

    // ── Add remainder to book if limit order not fully filled ──
    if (type === "LIMIT" && remainingQty > 0) {
      const level = { orderId, userId, price, qty: remainingQty };
      if (side === "BUY") store.addBid(market, level);
      else                store.addAsk(market, level);
    }

    // ── Update taker order in DB ───────────────────────────────
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