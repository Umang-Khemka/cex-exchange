import { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { store  } from "../lib/store.js";

// GET /api/markets
export const getMarkets = async (_req: Request, res: Response) => {
  try {
    const markets = await prisma.market.findMany();
    res.status(200).json(markets);
  } catch (error: any) {
    console.log("Error in getMarkets controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/markets/:symbol/orderbook
export const getOrderbook = (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const ob = store.getOrderbook(symbol);
    res.status(200).json({
      bids:            ob.bids.slice(0, 20),
      asks:            ob.asks.slice(0, 20),
      lastTradedPrice: ob.lastTradedPrice,
    });
  } catch (error: any) {
    console.log("Error in getOrderbook controller", error.message);
    res.status(404).json({ message: error.message });
  }
};

// GET /api/markets/:symbol/candles?interval=ONE_HOUR&from=...&to=...
export const getCandles = async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const interval    = (req.query.interval as string) || "ONE_HOUR";
    const from        = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to          = req.query.to   ? new Date(req.query.to   as string) : new Date();
    const limit       = req.query.limit ? Number(req.query.limit) : 200;

    const candles = await prisma.candle.findMany({
      where:   { market: symbol, interval: interval as any, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: "asc" },
      take:    limit,
    });

    res.status(200).json(candles);
  } catch (error: any) {
    console.log("Error in getCandles controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/markets/:symbol/ticker
export const getTicker = async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const ob         = store.getOrderbook(symbol);

    const yesterday  = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candles24h = await prisma.candle.findMany({
      where:   { market: symbol, interval: "ONE_HOUR", timestamp: { gte: yesterday } },
      orderBy: { timestamp: "asc" },
    });

    const volume24h = candles24h.reduce((sum, c) => sum + Number(c.volume), 0);
    const open24h   = Number(candles24h[0]?.open ?? 0);
    const high24h   = Math.max(...candles24h.map((c) => Number(c.high)));
    const low24h    = Math.min(...candles24h.map((c) => Number(c.low)));
    const lastPrice = ob.lastTradedPrice ?? 0;

    res.status(200).json({
      symbol,
      lastPrice,
      bestBid:   ob.bids[0]?.price ?? null,
      bestAsk:   ob.asks[0]?.price ?? null,
      volume24h,
      open24h,
      high24h,
      low24h,
      change24h: open24h ? ((lastPrice - open24h) / open24h) * 100 : 0,
    });
  } catch (error: any) {
    console.log("Error in getTicker controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};