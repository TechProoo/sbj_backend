-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "accuracy_meters" INTEGER,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7);

