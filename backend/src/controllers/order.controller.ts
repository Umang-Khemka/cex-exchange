import { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { store  } from "../lib/store.js";
import { MatchingEngine } from "../lib/engine.js";
import type { CreateOrderBody } from "../types/index.js";

// POST /api/orders
export const placeOrder = async (req: Request, res: Response) => {
  const { market, price, qty, type, side } = req.body as CreateOrderBody;
  const userId = req.user!.id;

  try {
    if (!market || !qty || !type || !side) {
      return res.status(400).json({ message: "market, qty, type, side are required" });
    }
    if (type === "LIMIT" && !price) {
      return res.status(400).json({ message: "price required for LIMIT orders" });
    }

    const marketRow = await prisma.market.findUnique({ where: { symbol: market } });
    if (!marketRow) return res.status(404).json({ message: "Market not found" });

    const { baseAsset, quoteAsset } = marketRow;

    // check balance before placing
    const lockAsset  = side === "BUY" ? quoteAsset : baseAsset;
    const lockAmount = side === "BUY" ? qty * price : qty;

    const balance = store.getBalance(userId, lockAsset);
    if (balance.available < lockAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // lock funds immediately
    store.lockFunds(userId, lockAsset, lockAmount);

    // create order in DB to get an ID
    const order = await prisma.order.create({
      data: {
        userId,
        marketId:  marketRow.id,
        market,
        price:     price || 0,
        qty,
        filledQty: 0,
        type,
        side,
        status:    "OPEN",
      },
    });

    // run through matching engine
    const result = await MatchingEngine.processOrder({
      orderId: order.id,
      userId,
      market,
      baseAsset,
      quoteAsset,
      price:  price || 0,
      qty,
      type,
      side,
    });

    // if fully filled, unlock leftover (nothing to unlock but keep it clean)
    // if partial/open, the remainder is already sitting in the book

    res.status(201).json({
      message:      "Order placed",
      orderId:      order.id,
      status:       result.status,
      filledQty:    result.filledQty,
      remainingQty: result.remainingQty,
      fills:        result.fills.length,
    });
  } catch (error: any) {
    console.log("Error in placeOrder controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// DELETE /api/orders/:id
export const cancelOrder = async (req: Request, res: Response) => {
  const orderId = Number(req.params.id);
  const userId  = req.user!.id;

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status !== "OPEN" && order.status !== "PARTIALLY_FILLED") {
      return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    const marketRow = await prisma.market.findUnique({ where: { symbol: order.market } });
    if (!marketRow) return res.status(404).json({ message: "Market not found" });

    // remove from in-memory orderbook
    store.removeBid(order.market, orderId);
    store.removeAsk(order.market, orderId);

    // unlock remaining funds
    const remainingQty = Number(order.qty) - Number(order.filledQty);
    if (order.side === "BUY") {
      store.unlockFunds(userId, marketRow.quoteAsset, remainingQty * Number(order.price));
    } else {
      store.unlockFunds(userId, marketRow.baseAsset, remainingQty);
    }

    await prisma.order.update({
      where: { id: orderId },
      data:  { status: "CANCELLED" },
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
      where:   { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take:    50,
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
      where:   { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take:    50,
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
    const userId  = req.user!.id;
    const assets  = ["USD", "SOL", "BTC", "AXIS"];
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
      where:  { userId_asset: { userId, asset } },
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