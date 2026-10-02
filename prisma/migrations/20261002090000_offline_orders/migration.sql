-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "client_ref" TEXT,
ADD COLUMN     "offline_ref" TEXT,
ADD COLUMN     "synced_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "orders_client_ref_key" ON "orders"("client_ref");
