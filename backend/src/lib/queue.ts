import { Queue } from "bullmq";
import { redis } from "./redis.js";

// one queue for all DB writes
export const dbQueue = new Queue("db-writes", {
  connection: redis as any,
  defaultJobOptions: {
    attempts:  3,
    backoff: {
      type:  "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail:     500,
  },
});

// TEMP — remove after diagnosing latency
(async () => {
  const t1 = Date.now();
  await redis.ping();
  console.log(`raw PING: ${Date.now() - t1}ms`);

  const t2 = Date.now();
  await dbQueue.add("test_job", { type: "TEST", data: {} });
  console.log(`dbQueue.add: ${Date.now() - t2}ms`);
})();