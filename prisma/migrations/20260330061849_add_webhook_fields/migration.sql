-- AlterEnum
ALTER TYPE "GitHubSyncAction" ADD VALUE 'WEBHOOK_SETUP';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "webhookId" INTEGER,
ADD COLUMN     "webhookSecret" TEXT;
