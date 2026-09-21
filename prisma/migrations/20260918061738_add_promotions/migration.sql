-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "kicker" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "terms" TEXT,
    "cta_label" TEXT,
    "cta_href" TEXT,
    "image_url" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotions_is_active_position_idx" ON "promotions"("is_active", "position");
