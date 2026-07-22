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

    // track what needs to go to DB
    const makerUpdates:   any[] = [];
    const balanceChanges: any[] = [];
    const candleUpdates:  any[] = [];
    const dbFills:        any[] = [];

    // ── Pure RAM matching loop ─────────────────────────
    while (remainingQty > 0 && opposingSide.length > 0) {
      const best = opposingSide[0];

      if (type === "LIMIT") {
        if (side === "BUY"  && best.price > price) break;
        if (side === "SELL" && best.price < price) break;
      }

      const fillQty   = Math.min(remainingQty, best.qty);
      const fillPrice = best.price;

      fills.push({
        price: fillPrice, qty: fillQty,
        makerOrderId: best.orderId, makerUserId: best.userId,
        takerOrderId: orderId,      takerUserId: userId,
      });

      best.qty     -= fillQty;
      remainingQty -= fillQty;
      filledQty    += fillQty;

      // RAM only — instant
      store.setLastTradedPrice(market, fillPrice);

      const buyerUserId  = side === "BUY" ? userId : best.userId;
      const sellerUserId = side === "BUY" ? best.userId : userId;

      // settle RAM balances immediately
      store.settleTrade(buyerUserId, sellerUserId, baseAsset, quoteAsset, fillQty, fillPrice);

      // collect maker update for DB
      if (best.qty <= 0) {
        opposingSide.shift();
        makerUpdates.push({ orderId: best.orderId, filledQty: fillQty, status: "FILLED" });
      } else {
        makerUpdates.push({ orderId: best.orderId, filledQty: fillQty, status: "PARTIALLY_FILLED" });
      }

      // collect fills for DB
      dbFills.push(
        { qty: fillQty, price: fillPrice, side: "SELL", fillType: "MAKER", userId: best.userId, asset: market, originalOrderId: best.orderId },
        { qty: fillQty, price: fillPrice, side: "BUY",  fillType: "TAKER", userId,             asset: market, originalOrderId: orderId      }
      );

      // collect balance changes for DB
      const totalCost = fillQty * fillPrice;
      balanceChanges.push(
        { userId: buyerUserId,  asset: quoteAsset, locked: totalCost, upsert: false },
        { userId: buyerUserId,  asset: baseAsset,  available: fillQty, upsert: true },
        { userId: sellerUserId, asset: baseAsset,  locked: fillQty,   upsert: false },
        { userId: sellerUserId, asset: quoteAsset, available: totalCost, upsert: true }
      );

      // collect candle updates for DB
      candleUpdates.push({ market, price: fillPrice, qty: fillQty });

      // broadcast trade in real time (RAM only, instant)
      wsManager.broadcastTrade(market, { price: fillPrice, qty: fillQty, side, ts: Date.now() });
      wsManager.sendBalanceUpdate(buyerUserId,  { asset: baseAsset,  ...store.getBalance(buyerUserId,  baseAsset)  });
      wsManager.sendBalanceUpdate(sellerUserId, { asset: quoteAsset, ...store.getBalance(sellerUserId, quoteAsset) });
    }

    // determine status
    let status: OrderStatus = "OPEN";
    if (remainingQty === 0)      status = "FILLED";
    else if (filledQty > 0)      status = "PARTIALLY_FILLED";

    // add remainder to book
    if (type === "LIMIT" && remainingQty > 0) {
      const level = { orderId, userId, price, qty: remainingQty };
      if (side === "BUY") store.addBid(market, level);
      else                store.addAsk(market, level);
    }

    // broadcast updated orderbook (RAM, instant)
    const ob2 = store.getOrderbook(market);
    wsManager.broadcastOrderbook(market, {
      bids: ob2.bids.slice(0, 20),
      asks: ob2.asks.slice(0, 20),
      lastTradedPrice: ob2.lastTradedPrice,
    });

    // ── Push ALL DB writes to queue in one job ─────────
    if (fills.length > 0) {
      dbQueue.add("settle_order", {
        type: "SETTLE_ORDER",
        data: {
          takerOrderId: orderId,
          takerStatus:  status,
          takerFilledQty: filledQty,
          makerUpdates,
          fills:          dbFills,
          balanceChanges,
          candleUpdates,
        },
      }).catch((err) => console.log("settle_order enqueue failed", err.message));
    } else {
      // no fills — just update taker order status in DB async
      dbQueue.add("update_order", {
        type: "SETTLE_ORDER",
        data: {
          takerOrderId:   orderId,
          takerStatus:    status,
          takerFilledQty: filledQty,
          makerUpdates:   [],
          fills:          [],
          balanceChanges: [],
          candleUpdates:  [],
        },
      }).catch((err) => console.log("update_order enqueue failed", err.message));
    }

    return { filledQty, remainingQty, fills, status };
  }
}