-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "rollbackOfId" INTEGER;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_rollbackOfId_fkey" FOREIGN KEY ("rollbackOfId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
