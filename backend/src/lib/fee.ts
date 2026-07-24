// fee rates
export const FEE_RATES = {
  MAKER: 0.001, // 0.1% — lower fee for liquidity providers
  TAKER: 0.002, // 0.2% — higher fee for liquidity takers
};

export function calculateFee(qty: number, price: number, fillType: "MAKER" | "TAKER"): number {
  const tradeValue = qty * price;
  const feeRate    = FEE_RATES[fillType];
  // round to 8 decimal places
  return Math.round(tradeValue * feeRate * 1e8) / 1e8;
}

// what asset the fee is charged in
// buyer  pays fee in baseAsset  (SOL) — they just received SOL
// seller pays fee in quoteAsset (USD) — they just received USD
export function getFeeAsset(
  side:     "BUY" | "SELL",
  fillType: "MAKER" | "TAKER",
  baseAsset:  string,
  quoteAsset: string
): string {
  // taker BUY  → receiving SOL → fee in SOL
  // taker SELL → receiving USD → fee in USD
  // maker BUY  → receiving SOL → fee in SOL
  // maker SELL → receiving USD → fee in USD
  return side === "BUY" ? baseAsset : quoteAsset;
}