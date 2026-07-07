import type {
  Orderbook,
  OrderbookLevel,
  AssetBalance,
  BalanceStore,
} from "../types/index.js";

class InMemoryStore {
  private orderbooks: Map<string, Orderbook> = new Map();
  private balances:   BalanceStore           = new Map();

  // ── Orderbook ────────────────────────────
  initMarket(market: string): void {
    if (!this.orderbooks.has(market)) {
      this.orderbooks.set(market, {
        bids: [],
        asks: [],
        lastTradedPrice: null,
      });
    }
  }

  getOrderbook(market: string): Orderbook {
    const ob = this.orderbooks.get(market);
    if (!ob) throw new Error(`Market ${market} not initialised`);
    return ob;
  }

  addBid(market: string, level: OrderbookLevel): void {
    const ob = this.getOrderbook(market);
    ob.bids.push(level);
    ob.bids.sort((a, b) => b.price - a.price); // HIGH → LOW
  }

  addAsk(market: string, level: OrderbookLevel): void {
    const ob = this.getOrderbook(market);
    ob.asks.push(level);
    ob.asks.sort((a, b) => a.price - b.price); // LOW → HIGH
  }

  removeBid(market: string, orderId: number): void {
    const ob = this.getOrderbook(market);
    ob.bids = ob.bids.filter((b) => b.orderId !== orderId);
  }

  removeAsk(market: string, orderId: number): void {
    const ob = this.getOrderbook(market);
    ob.asks = ob.asks.filter((a) => a.orderId !== orderId);
  }

  setLastTradedPrice(market: string, price: number): void {
    this.getOrderbook(market).lastTradedPrice = price;
  }

  // ── Balances ─────────────────────────────
  initUserBalance(userId: number, asset: string, available = 0): void {
    if (!this.balances.has(userId)) {
      this.balances.set(userId, new Map());
    }
    const userMap = this.balances.get(userId)!;
    if (!userMap.has(asset)) {
      userMap.set(asset, { available, locked: 0 });
    }
  }

  getBalance(userId: number, asset: string): AssetBalance {
    const b = this.balances.get(userId)?.get(asset);
    if (!b) throw new Error(`No balance for user ${userId} asset ${asset}`);
    return b;
  }

  lockFunds(userId: number, asset: string, amount: number): void {
    const b = this.getBalance(userId, asset);
    if (b.available < amount) throw new Error("Insufficient balance");
    b.available -= amount;
    b.locked    += amount;
  }

  unlockFunds(userId: number, asset: string, amount: number): void {
    const b = this.getBalance(userId, asset);
    b.locked    -= amount;
    b.available += amount;
  }

  settleTrade(
    buyerUserId:  number,
    sellerUserId: number,
    baseAsset:    string,
    quoteAsset:   string,
    qty:          number,
    price:        number
  ): void {
    const totalCost = qty * price;

    // Buyer: locked USD out → SOL in
    const buyerUSD  = this.getBalance(buyerUserId, quoteAsset);
    buyerUSD.locked -= totalCost;
    this.initUserBalance(buyerUserId, baseAsset);
    this.getBalance(buyerUserId, baseAsset).available += qty;

    // Seller: locked SOL out → USD in
    const sellerSOL  = this.getBalance(sellerUserId, baseAsset);
    sellerSOL.locked -= qty;
    this.initUserBalance(sellerUserId, quoteAsset);
    this.getBalance(sellerUserId, quoteAsset).available += totalCost;
  }

  getAllBalances(): BalanceStore {
    return this.balances;
  }

  debugOrderbook(market: string): void {
    const ob = this.getOrderbook(market);
    console.log(`\n=== ORDERBOOK [${market.toUpperCase()}] ===`);
    ob.asks.slice(0, 5).forEach((a) => console.log(`  ASK $${a.price} | qty: ${a.qty}`));
    console.log(`  Last: $${ob.lastTradedPrice}`);
    ob.bids.slice(0, 5).forEach((b) => console.log(`  BID $${b.price} | qty: ${b.qty}`));
    console.log("===========================\n");
  }
}

export const store = new InMemoryStore();