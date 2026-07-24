-- AlterTable
ALTER TABLE "Fill" ADD COLUMN     "fee" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN     "feeAssest" TEXT NOT NULL DEFAULT 'USD';

-- CreateTable
CREATE TABLE "FeeCollection" (
    "id" SERIAL NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "fillType" "FillType" NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeCollection_asset_idx" ON "FeeCollection"("asset");

-- CreateIndex
CREATE INDEX "FeeCollection_createdAt_idx" ON "FeeCollection"("createdAt");
