import { Router } from "express";
import { getMarkets, getOrderbook, getCandles, getTicker } from "../controllers/market.controller.js";

const router = Router();

router.get("/",                  getMarkets);
router.get("/:symbol/orderbook", getOrderbook);
router.get("/:symbol/candles",   getCandles);
router.get("/:symbol/ticker",    getTicker);

export default router;