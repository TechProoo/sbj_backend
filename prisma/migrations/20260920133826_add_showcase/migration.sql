-- CreateTable
CREATE TABLE "showcases" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "place" TEXT,
    "blurb" TEXT,
    "image_url" TEXT NOT NULL,
    "cta_label" TEXT,
    "cta_href" TEXT,
    "happened_at" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "showcases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "showcases_is_published_position_idx" ON "showcases"("is_published", "position");
