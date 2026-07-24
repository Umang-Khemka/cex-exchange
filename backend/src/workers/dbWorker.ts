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
            makerUpdates,
            fills,
            balanceChanges,
            candleUpdates,
          } = data;

          // split regular balance changes from fee collections
          const regularChanges = balanceChanges.filter((b: any) => !b.isFee);
          const feeChanges = balanceChanges.filter((b: any) => b.isFee);

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
          if (fills.length > 0) {
            await prisma.fill.createMany({ data: fills });
          }

          // 3. settle regular balances only
          await Promise.all(
            regularChanges.map((b: any) =>
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

          // 4. record fee collections separately
          if (feeChanges.length > 0) {
            await prisma.feeCollection.createMany({
              data: feeChanges.map((f: any) => ({
                asset: f.asset,
                amount: f.available,
                fillType: f.fillType,
                userId: f.originalUserId,
              })),
            });
          }

          // 5. update candles
          if (candleUpdates.length > 0) {
            await Promise.all(
              candleUpdates.map((c: any) =>
                CandleService.updateCandles(c.market, c.price, c.qty),
              ),
            );
          }

          // 6. update taker order
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
