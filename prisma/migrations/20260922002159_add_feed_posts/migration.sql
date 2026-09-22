-- CreateEnum
CREATE TYPE "FeedKind" AS ENUM ('PROMO', 'GIST');

-- CreateTable
CREATE TABLE "feed_posts" (
    "id" UUID NOT NULL,
    "kind" "FeedKind" NOT NULL DEFAULT 'GIST',
    "caption" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_path" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "author_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feed_posts_is_published_created_at_idx" ON "feed_posts"("is_published", "created_at");

-- AddForeignKey
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
