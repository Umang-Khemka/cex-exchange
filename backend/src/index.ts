import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/db.js";
import { store } from "./lib/store.js";
import { wsManager } from "./lib/websocket.js";
import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import marketRoutes from "./routes/market.routes.js";
import { startDbWorker } from "./workers/dbWorker.js";
import { globalLimiter, authLimiter, orderLimiter, depositLimiter } from "./middlewares/rateLimiter.js";

startDbWorker(); // start the DB worker for async writes

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app); // http server wrapping express

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(globalLimiter);

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/orders", orderLimiter, orderRoutes);
// app.use("/api/deposits", depositLimiter, depositRoutes);
app.use("/api/markets", marketRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

async function bootstrap() {
  const markets = await prisma.market.findMany();
  markets.forEach((m) => {
    store.initMarket(m.symbol);
    store.setMarket(m.symbol, {
      id: m.id,
      baseAsset: m.baseAsset,
      quoteAsset: m.quoteAsset,
    });
  });

  const openOrders = await prisma.order.findMany({
    where: { status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    orderBy: { createdAt: "asc" },
  });
  for (const o of openOrders) {
    const remainingQty = Number(o.qty) - Number(o.filledQty);
    const level = {
      orderId: o.id,
      userId: o.userId,
      price: Number(o.price),
      qty: remainingQty,
    };
    if (o.side === "BUY") store.addBid(o.market, level);
    else store.addAsk(o.market, level);
  }

  const lastOrder = await prisma.order.findFirst({
    orderBy: { id: "desc" },
  });
  store.setOrderIdCounter(lastOrder?.id ?? 0);
  console.log(`✅ Order ID counter set to ${lastOrder?.id ?? 0}`);

  const balances = await prisma.balance.findMany();
  for (const b of balances) {
    store.initUserBalance(b.userId, b.asset, Number(b.available));
    const bal = store.getBalance(b.userId, b.asset);
    bal.available = Number(b.available);
    bal.locked = Number(b.locked);
  }

  console.log(
    `✅ ${markets.length} markets | ${openOrders.length} open orders loaded`,
  );

  // init WebSocket BEFORE server starts listening
  wsManager.init(server);

  server.listen(PORT, () => {
    console.log(`🚀 http://localhost:${PORT}`);
    console.log(`🔌 WebSocket ready on ws://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
