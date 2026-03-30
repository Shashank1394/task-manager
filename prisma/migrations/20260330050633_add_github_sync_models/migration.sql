-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('IMPORTED', 'EXPORTED', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "GitHubSyncAction" AS ENUM ('ISSUE_IMPORTED', 'ISSUE_UPDATED', 'ISSUE_EXPORTED', 'PR_LINKED', 'COMMIT_LINKED', 'BRANCH_CREATED', 'WEBHOOK_RECEIVED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "githubIssueUrl" TEXT;

-- CreateTable
CREATE TABLE "GitHubIssue" (
    "id" TEXT NOT NULL,
    "githubIssueId" INTEGER NOT NULL,
    "githubIssueNumber" INTEGER NOT NULL,
    "syncDirection" "SyncDirection" NOT NULL DEFAULT 'IMPORTED',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "GitHubIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubSyncLog" (
    "id" TEXT NOT NULL,
    "action" "GitHubSyncAction" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "GitHubSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubIssue_taskId_key" ON "GitHubIssue"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubIssue_projectId_githubIssueNumber_key" ON "GitHubIssue"("projectId", "githubIssueNumber");

-- AddForeignKey
ALTER TABLE "GitHubIssue" ADD CONSTRAINT "GitHubIssue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubIssue" ADD CONSTRAINT "GitHubIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubSyncLog" ADD CONSTRAINT "GitHubSyncLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
