export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "PARTIALLY_FILLED";
export type FillType = "MAKER" | "TAKER";

// ── Orderbook ──────────────────────────────
export interface OrderbookLevel {
  orderId: number;
  userId:  number;
  price:   number;
  qty:     number;
}

export interface Orderbook {
  bids: OrderbookLevel[]; // HIGH → LOW
  asks: OrderbookLevel[]; // LOW  → HIGH
  lastTradedPrice: number | null;
}

// ── Balances ───────────────────────────────
export interface AssetBalance {
  available: number;
  locked:    number;
}

export type BalanceStore = Map<number, Map<string, AssetBalance>>;

// ── Matching engine output ─────────────────
export interface MatchedFill {
  price:          number;
  qty:            number;
  makerOrderId:   number;
  makerUserId:    number;
  takerOrderId:   number;
  takerUserId:    number;
}

export interface TradeResult {
  filledQty:    number;
  remainingQty: number;
  fills:        MatchedFill[];
  status:       OrderStatus;
}

// ── Request bodies ─────────────────────────
export interface CreateOrderBody {
  market: string;
  price:  number;
  qty:    number;
  type:   OrderType;
  side:   OrderSide;
}

export interface RegisterBody {
  username: string;
  password: string;
}

// ── JWT ────────────────────────────────────
export interface JwtPayload {
  userId:   number;
  username: string;
  email:    string;
}