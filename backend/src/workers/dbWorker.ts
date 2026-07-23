import { Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/db.js";
import { CandleService } from "../lib/candle.js";

export function startDbWorker() {
  const worker = new Worker(
    "db-writes",
    async (job) => {
      const { type, data } = job.data;

      switch (type) {
        // ── Lock funds in DB when order placed ──────────
        case "LOCK_FUNDS": {
          await prisma.balance.update({
            where: { userId_asset: { userId: data.userId, asset: data.asset } },
            data: {
              available: { decrement: data.amount },
              locked: { increment: data.amount },
            },
          });
          break;
        }

        // ── Create order record in DB ───────────────────
        case "CREATE_ORDER": {
          await prisma.order.create({ data: data.order });
          break;
        }

        // ── After fill — all DB writes in one job ───────
        case "SETTLE_ORDER": {
          const {
            takerOrderId,
            takerStatus,
            takerFilledQty,
            makerUpdates, // [{ orderId, filledQty, status }]
            fills, // [{ qty, price, side, fillType, userId, asset, originalOrderId }]
            balanceChanges, // [{ userId, asset, available, locked, upsert }]
            candleUpdates, // [{ market, price, qty }]
          } = data;

          // 1. update all maker orders
          await Promise.all(
            makerUpdates.map((m: any) =>
              prisma.order.update({
                where: { id: m.orderId },
                data: {
                  status: m.status,
                  filledQty: { increment: m.filledQty },
                },
              }),
            ),
          );

          // 2. persist all fills in one bulk write
          await prisma.fill.createMany({ data: fills });

          // 3. settle balances
          await Promise.all(
            balanceChanges.map((b: any) =>
              b.upsert
                ? prisma.balance.upsert({
                    where: {
                      userId_asset: { userId: b.userId, asset: b.asset },
                    },
                    update: { available: { increment: b.available } },
                    create: {
                      userId: b.userId,
                      asset: b.asset,
                      available: b.available,
                      locked: 0,
                    },
                  })
                : prisma.balance.update({
                    where: {
                      userId_asset: { userId: b.userId, asset: b.asset },
                    },
                    data: {
                      locked: { decrement: b.locked },
                      available: { increment: b.available ?? 0 },
                    },
                  }),
            ),
          );

          // 4. update candles for each fill
          await Promise.all(
            candleUpdates.map((c: any) =>
              CandleService.updateCandles(c.market, c.price, c.qty),
            ),
          );

          // 5. update taker order status
          await prisma.order.update({
            where: { id: takerOrderId },
            data: {
              status: takerStatus,
              filledQty: { increment: takerFilledQty },
            },
          });

          break;
        }

        // ── Unlock funds when order cancelled ───────────
        case "UNLOCK_FUNDS": {
          await prisma.balance.update({
            where: { userId_asset: { userId: data.userId, asset: data.asset } },
            data: {
              available: { increment: data.amount },
              locked: { decrement: data.amount },
            },
          });
          break;
        }

        case "LOCK_AND_CREATE": {
          const { lockUserId, lockAsset, lockAmount, order } = data;

          await Promise.all([
            // lock funds in DB
            prisma.balance.update({
              where: { userId_asset: { userId: lockUserId, asset: lockAsset } },
              data: {
                available: { decrement: lockAmount },
                locked: { increment: lockAmount },
              },
            }),
            // create order in DB with the RAM-generated ID
            prisma.order.create({ data: order }),
          ]);
          break;
        }

        case "CANCEL_ORDER": {
          await prisma.order.update({
            where: { id: data.orderId },
            data: { status: "CANCELLED" },
          });
          break;
        }

        default:
          console.warn(`Unknown job type: ${type}`);
      }
    },
    {
      connection: redis.options,
      concurrency: 5, // process 5 jobs at once
    },
  );

  worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} [${job.data.type}] completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} [${job?.data.type}] failed:`, err.message);
  });

  console.log("⚙️  DB worker started");
  return worker;
}
