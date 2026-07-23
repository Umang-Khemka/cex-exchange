import { prisma }        from "./db.js";
import { store }         from "./store.js";
import { dbQueue }       from "./queue.js";
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

    // collect everything that needs to go to DB
    const makerUpdates:   any[] = [];
    const balanceChanges: any[] = [];
    const candleUpdates:  any[] = [];
    const dbFills:        any[] = [];

    // ── Matching loop ──────────────────────────────────
    let i = 0;
    while (remainingQty > 0 && i < opposingSide.length) {
      const best = opposingSide[i];

      // skip own orders — don't self trade
      if (best.userId === userId) {
        i++;
        continue;
      }

      // limit order price check
      if (type === "LIMIT") {
        if (side === "BUY"  && best.price > price) break;
        if (side === "SELL" && best.price < price) break;
      }

      const fillQty   = Math.min(remainingQty, best.qty);
      const fillPrice = best.price;

      // collect fill
      fills.push({
        price:        fillPrice,
        qty:          fillQty,
        makerOrderId: best.orderId,
        makerUserId:  best.userId,
        takerOrderId: orderId,
        takerUserId:  userId,
      });

      // update quantities
      best.qty     -= fillQty;
      remainingQty -= fillQty;
      filledQty    += fillQty;

      // update last traded price in RAM
      store.setLastTradedPrice(market, fillPrice);

      // settle balances in RAM immediately
      const buyerUserId  = side === "BUY" ? userId     : best.userId;
      const sellerUserId = side === "BUY" ? best.userId : userId;
      store.settleTrade(buyerUserId, sellerUserId, baseAsset, quoteAsset, fillQty, fillPrice);

      // collect maker order update for DB
      if (best.qty <= 0) {
        opposingSide.splice(i, 1); // fully filled → remove from book, don't increment i
        makerUpdates.push({ orderId: best.orderId, filledQty: fillQty, status: "FILLED" });
      } else {
        i++; // partially filled → stays in book, move to next
        makerUpdates.push({ orderId: best.orderId, filledQty: fillQty, status: "PARTIALLY_FILLED" });
      }

      // collect fill rows for DB (two rows per fill — one per user)
      dbFills.push(
        { qty: fillQty, price: fillPrice, side: "SELL", fillType: "MAKER", userId: best.userId, asset: market, originalOrderId: best.orderId },
        { qty: fillQty, price: fillPrice, side: "BUY",  fillType: "TAKER", userId,             asset: market, originalOrderId: orderId      }
      );

      // collect balance changes for DB
      const totalCost = fillQty * fillPrice;
      balanceChanges.push(
        { userId: buyerUserId,  asset: quoteAsset, locked: totalCost, upsert: false },
        { userId: buyerUserId,  asset: baseAsset,  available: fillQty,   upsert: true  },
        { userId: sellerUserId, asset: baseAsset,  locked: fillQty,   upsert: false },
        { userId: sellerUserId, asset: quoteAsset, available: totalCost, upsert: true  }
      );

      // collect candle updates for DB
      candleUpdates.push({ market, price: fillPrice, qty: fillQty });

      // broadcast trade + balance updates via WebSocket instantly
      wsManager.broadcastTrade(market, {
        price: fillPrice,
        qty:   fillQty,
        side,
        ts:    Date.now(),
      });
      wsManager.sendBalanceUpdate(buyerUserId,  { asset: baseAsset,  ...store.getBalance(buyerUserId,  baseAsset)  });
      wsManager.sendBalanceUpdate(sellerUserId, { asset: quoteAsset, ...store.getBalance(sellerUserId, quoteAsset) });
    }

    // ── Determine taker order status ───────────────────
    let status: OrderStatus = "OPEN";
    if (remainingQty === 0)      status = "FILLED";
    else if (filledQty > 0)      status = "PARTIALLY_FILLED";

    // ── Add unfilled remainder to book ─────────────────
    if (type === "LIMIT" && remainingQty > 0) {
      const level = { orderId, userId, price, qty: remainingQty };
      if (side === "BUY") store.addBid(market, level);
      else                store.addAsk(market, level);
    }

    // ── Broadcast updated orderbook ────────────────────
    const updatedOb = store.getOrderbook(market);
    wsManager.broadcastOrderbook(market, {
      bids:            updatedOb.bids.slice(0, 20),
      asks:            updatedOb.asks.slice(0, 20),
      lastTradedPrice: updatedOb.lastTradedPrice,
    });

    // ── Push all DB writes to queue in one job ─────────
    await dbQueue.add("settle_order", {
      type: "SETTLE_ORDER",
      data: {
        takerOrderId:   orderId,
        takerStatus:    status,
        takerFilledQty: filledQty,
        makerUpdates,
        fills:          dbFills,
        balanceChanges,
        candleUpdates,
      },
    });

    return { filledQty, remainingQty, fills, status };
  }
}