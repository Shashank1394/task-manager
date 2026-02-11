-- CreateEnum
CREATE TYPE "RepoProvider" AS ENUM ('GITHUB');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "repoName" TEXT,
ADD COLUMN     "repoOwner" TEXT,
ADD COLUMN     "repoProvider" "RepoProvider";
