import { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { store } from "../lib/store.js";
import { MatchingEngine } from "../lib/engine.js";
import type { CreateOrderBody } from "../types/index.js";
import { BalanceSync } from "../lib/balanceSync.js";
import { wsManager } from "../lib/websocket.js";
import { dbQueue } from "../lib/queue.js";

// POST /api/orders
export const placeOrder = async (req: Request, res: Response) => {
  const { market, price, qty, type, side } = req.body as CreateOrderBody;
  const userId = req.user!.id;
  const tStart = Date.now();

  try {
    if (!market || !qty || !type || !side) {
      return res
        .status(400)
        .json({ message: "market, qty, type, side are required" });
    }
    if (type === "LIMIT" && !price) {
      return res
        .status(400)
        .json({ message: "price required for LIMIT orders" });
    }

    const marketRow = await prisma.market.findUnique({
      where: { symbol: market },
    });
    console.log("⏱ after market lookup:", Date.now() - tStart, "ms");
    if (!marketRow)
      return res.status(404).json({ message: "Market not found" });

    const { baseAsset, quoteAsset } = marketRow;

    // check balance before placing
    const lockAsset = side === "BUY" ? quoteAsset : baseAsset;
    const lockAmount = side === "BUY" ? qty * price : qty;

    const balance = store.getBalance(userId, lockAsset);
    if (balance.available < lockAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // lock funds immediately
    // store.lockFunds(userId, lockAsset, lockAmount);
    // // await BalanceSync.lockFunds(userId, lockAsset, lockAmount);
    // await dbQueue.add("lock_funds", {
    //   type: "LOCK_FUNDS",
    //   data: { userId, asset: lockAsset, amount: lockAmount },
    // });

    // create order in DB to get an ID
    // const order = await prisma.order.create({
    //   data: {
    //     userId,
    //     marketId: marketRow.id,
    //     market,
    //     price: price || 0,
    //     qty,
    //     filledQty: 0,
    //     type,
    //     side,
    //     status: "OPEN",
    //   },
    // });

    const orderId = store.generateOrderId();
    store.lockFunds(userId, lockAsset, lockAmount);
    console.log("⏱ after lock:", Date.now() - tStart, "ms");

    // push BOTH DB writes to queue — no awaiting
    dbQueue.add("lock_and_create", {
      type: "LOCK_AND_CREATE",
      data: {
        lockUserId: userId,
        lockAsset,
        lockAmount,
        order: {
          id: orderId,
          userId,
          marketId: marketRow.id,
          market,
          price: price || 0,
          qty,
          filledQty: 0,
          type,
          side,
          status: "OPEN",
        },
      },
    });

    // run through matching engine
    const result = await MatchingEngine.processOrder({
      orderId,
      userId,
      market,
      baseAsset,
      quoteAsset,
      price: price || 0,
      qty,
      type,
      side,
    });

    console.log("⏱ after matching engine:", Date.now() - tStart, "ms");

    const ob = store.getOrderbook(market);
    wsManager.broadcastOrderbook(market, {
      bids: ob.bids.slice(0, 20),
      asks: ob.asks.slice(0, 20),
      lastTradedPrice: ob.lastTradedPrice,
    });

    // if fully filled, unlock leftover (nothing to unlock but keep it clean)
    // if partial/open, the remainder is already sitting in the book

    console.log("⏱ before response:", Date.now() - tStart, "ms");

    res.status(201).json({
      message: "Order placed",
      orderId,
      status: result.status,
      filledQty: result.filledQty,
      remainingQty: result.remainingQty,
      fills: result.fills.length,
    });
  } catch (error: any) {
    console.log("Error in placeOrder controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// DELETE /api/orders/:id
export const cancelOrder = async (req: Request, res: Response) => {
  const orderId = Number(req.params.id);
  const userId = req.user!.id;

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status !== "OPEN" && order.status !== "PARTIALLY_FILLED") {
      return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    const marketRow = store.getMarket(order.market);
    if (!marketRow)
      return res.status(404).json({ message: "Market not found" });

    // remove from in-memory orderbook
    store.removeBid(order.market, orderId);
    store.removeAsk(order.market, orderId);

    // unlock remaining funds
    const remainingQty = Number(order.qty) - Number(order.filledQty);

    if (order.side === "BUY") {
      const unlockAmount = remainingQty * Number(order.price);
      store.unlockFunds(userId, marketRow.quoteAsset, unlockAmount);
      // await BalanceSync.unlockFunds(userId, marketRow.quoteAsset, unlockAmount); // ← ADD
      await dbQueue.add("unlock_funds", {
        type: "UNLOCK_FUNDS",
        data: { userId, asset: marketRow.quoteAsset, amount: unlockAmount },
      });
    } else {
      store.unlockFunds(userId, marketRow.baseAsset, remainingQty);
      // await BalanceSync.unlockFunds(userId, marketRow.baseAsset, remainingQty); // ← ADD
      await dbQueue.add("unlock_funds", {
        type: "UNLOCK_FUNDS",
        data: { userId, asset: marketRow.baseAsset, amount: remainingQty },
      });
    }

    await dbQueue.add("cancel_order", {
      type: "CANCEL_ORDER",
      data: { orderId },
    });

    const ob = store.getOrderbook(order.market);
    wsManager.broadcastOrderbook(order.market, {
      bids: ob.bids.slice(0, 20),
      asks: ob.asks.slice(0, 20),
      lastTradedPrice: ob.lastTradedPrice,
    });

    res.status(200).json({ message: "Order cancelled" });
  } catch (error: any) {
    console.log("Error in cancelOrder controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/orders
export const getOrders = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.status(200).json(orders);
  } catch (error: any) {
    console.log("Error in getOrders controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/orders/fills
export const getFills = async (req: Request, res: Response) => {
  try {
    const fills = await prisma.fill.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.status(200).json(fills);
  } catch (error: any) {
    console.log("Error in getFills controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/orders/balance
export const getBalance = (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const assets = ["USD", "SOL", "BTC", "AXIS"];
    const balance: Record<string, any> = {};

    for (const asset of assets) {
      try {
        balance[asset] = store.getBalance(userId, asset);
      } catch {
        balance[asset] = { available: 0, locked: 0 };
      }
    }

    res.status(200).json(balance);
  } catch (error: any) {
    console.log("Error in getBalance controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/orders/deposit
export const deposit = async (req: Request, res: Response) => {
  const { asset, amount } = req.body;
  const userId = req.user!.id;

  try {
    if (!asset || !amount || amount <= 0) {
      return res.status(400).json({ message: "asset and amount required" });
    }

    // update DB
    await prisma.balance.upsert({
      where: { userId_asset: { userId, asset } },
      update: { available: { increment: amount } },
      create: { userId, asset, available: amount, locked: 0 },
    });

    // update RAM
    store.initUserBalance(userId, asset, 0);
    const bal = store.getBalance(userId, asset);
    bal.available += amount;

    res.status(200).json({
      message: `Deposited ${amount} ${asset}`,
      balance: store.getBalance(userId, asset),
    });
  } catch (error: any) {
    console.log("Error in deposit controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
