-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "workflow" TEXT NOT NULL DEFAULT 'deploy.yml';
