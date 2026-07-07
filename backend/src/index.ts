import "dotenv/config";
import express    from "express";
import cors       from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/db.js";
import { store  } from "./lib/store.js";
import authRoutes from "./routes/auth.routes.js";

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Routes ──────────────────────────
app.use("/api/auth", authRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Bootstrap ────────────────────────
async function bootstrap() {
  const markets = await prisma.market.findMany();
  markets.forEach((m) => store.initMarket(m.symbol));

  const openOrders = await prisma.order.findMany({
    where:   { status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    orderBy: { createdAt: "asc" },
  });
  for (const o of openOrders) {
    const remainingQty = Number(o.qty) - Number(o.filledQty);
    const level = { orderId: o.id, userId: o.userId, price: Number(o.price), qty: remainingQty };
    if (o.side === "BUY") store.addBid(o.market, level);
    else                  store.addAsk(o.market, level);
  }

  const balances = await prisma.balance.findMany();
  for (const b of balances) {
    store.initUserBalance(b.userId, b.asset, Number(b.available));
    const bal     = store.getBalance(b.userId, b.asset);
    bal.available = Number(b.available);
    bal.locked    = Number(b.locked);
  }

  console.log(`✅ ${markets.length} markets | ${openOrders.length} open orders loaded`);
  app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});