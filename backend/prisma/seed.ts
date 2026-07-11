import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL,
});

const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

async function main() {
  // seed markets
  await prisma.market.createMany({
    data: [
      { name: "Solana",    symbol: "sol",  baseAsset: "SOL",  quoteAsset: "USD" },
      { name: "Bitcoin",   symbol: "btc",  baseAsset: "BTC",  quoteAsset: "USD" },
      { name: "Axis Bank", symbol: "axis", baseAsset: "AXIS", quoteAsset: "USD" },
    ],
    skipDuplicates: true,
  });
  console.log("✅ Markets seeded");

  // seed a test user
  const { default: bcrypt } = await import("bcryptjs");
  const hash = await bcrypt.hash("test123", 10);

  const user = await prisma.user.upsert({
    where:  { username: "umang" },
    update: {},
    create: { username: "umang", password: hash },
  });
  console.log("✅ Test user seeded — username: umang | password: test123");

  // seed starting balance for test user
  await prisma.balance.upsert({
    where:  { userId_asset: { userId: user.id, asset: "USD" } },
    update: {},
    create: { userId: user.id, asset: "USD", available: 1500, locked: 0 },
  });
  console.log("✅ Balance seeded — $1500 USD for umang");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());