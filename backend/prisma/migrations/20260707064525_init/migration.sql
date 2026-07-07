-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('LIMIT', 'MARKET');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED', 'PARTIALLY_FILLED');

-- CreateEnum
CREATE TYPE "FillType" AS ENUM ('MAKER', 'TAKER');

-- CreateEnum
CREATE TYPE "CandleInterval" AS ENUM ('ONE_MINUTE', 'FIVE_MINUTES', 'FIFTEEN_MINUTES', 'ONE_HOUR', 'FOUR_HOURS', 'ONE_DAY');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "baseAsset" TEXT NOT NULL,
    "quoteAsset" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "marketId" INTEGER NOT NULL,
    "market" TEXT NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "qty" DECIMAL(20,8) NOT NULL,
    "filledQty" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "type" "OrderType" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" SERIAL NOT NULL,
    "qty" DECIMAL(20,8) NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "side" "OrderSide" NOT NULL,
    "fillType" "FillType" NOT NULL,
    "userId" INTEGER NOT NULL,
    "asset" TEXT NOT NULL,
    "originalOrderId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Balance" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "asset" TEXT NOT NULL,
    "available" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "locked" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" SERIAL NOT NULL,
    "marketId" INTEGER NOT NULL,
    "market" TEXT NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "open" DECIMAL(20,8) NOT NULL,
    "high" DECIMAL(20,8) NOT NULL,
    "low" DECIMAL(20,8) NOT NULL,
    "close" DECIMAL(20,8) NOT NULL,
    "volume" DECIMAL(20,8) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Market_symbol_key" ON "Market"("symbol");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_market_status_idx" ON "Order"("market", "status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Fill_userId_idx" ON "Fill"("userId");

-- CreateIndex
CREATE INDEX "Fill_originalOrderId_idx" ON "Fill"("originalOrderId");

-- CreateIndex
CREATE INDEX "Fill_asset_createdAt_idx" ON "Fill"("asset", "createdAt");

-- CreateIndex
CREATE INDEX "Balance_userId_idx" ON "Balance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Balance_userId_asset_key" ON "Balance"("userId", "asset");

-- CreateIndex
CREATE INDEX "Candle_market_interval_timestamp_idx" ON "Candle"("market", "interval", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_market_interval_timestamp_key" ON "Candle"("market", "interval", "timestamp");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_originalOrderId_fkey" FOREIGN KEY ("originalOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candle" ADD CONSTRAINT "Candle_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
