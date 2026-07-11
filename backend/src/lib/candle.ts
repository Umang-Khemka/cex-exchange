import { prisma } from "./db.js";

const INTERVALS: Record<string, number> = {
  ONE_MINUTE:      60_000,
  FIVE_MINUTES:    5  * 60_000,
  FIFTEEN_MINUTES: 15 * 60_000,
  ONE_HOUR:        60 * 60_000,
  FOUR_HOURS:      4  * 60 * 60_000,
  ONE_DAY:         24 * 60 * 60_000,
};

export class CandleService {
  static async updateCandles(market: string, price: number, qty: number) {
    const now = Date.now();

    // update all 6 intervals in parallel
    await Promise.all(
      Object.entries(INTERVALS).map(([interval, ms]) =>
        this.upsertCandle(market, interval, price, qty, now, ms)
      )
    );
  }

  private static async upsertCandle(
    market:   string,
    interval: string,
    price:    number,
    qty:      number,
    now:      number,
    bucketMs: number
  ) {
    // snap current time to bucket start
    // e.g. for 1h bucket: 14:37 → 14:00
    const bucketStart = new Date(Math.floor(now / bucketMs) * bucketMs);

    const marketRow = await prisma.market.findUnique({ where: { symbol: market } });
    if (!marketRow) return;

    const existing = await prisma.candle.findUnique({
      where: {
        market_interval_timestamp: {
          market,
          interval: interval as any,
          timestamp: bucketStart,
        },
      },
    });

    if (existing) {
      // candle already exists for this bucket → update it
      await prisma.candle.update({
        where: { id: existing.id },
        data: {
          high:   { set: Math.max(Number(existing.high), price) },
          low:    { set: Math.min(Number(existing.low),  price) },
          close:  price,          // latest trade = new close
          volume: { increment: qty },
        },
      });
    } else {
      // first trade in this bucket → create new candle
      // open = first trade price in the bucket
      await prisma.candle.create({
        data: {
          marketId:  marketRow.id,
          market,
          interval:  interval as any,
          open:      price,
          high:      price,
          low:       price,
          close:     price,
          volume:    qty,
          timestamp: bucketStart,
        },
      });
    }
  }
}