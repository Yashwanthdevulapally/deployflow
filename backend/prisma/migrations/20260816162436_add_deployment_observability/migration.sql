-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "workflow" SET DEFAULT 'deployflow.yml';
