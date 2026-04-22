import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError, unauthorized } from "@/lib/api-errors";
import {
  requireGitHubAccessToken,
  requireGitHubProjectAccess,
} from "@/lib/github-route";

type GitHubCommitResponse = {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    } | null;
  };
  html_url: string;
};

/**
 * Extract task IDs from commit message.
 * Looks for patterns like "TASK-clxyz123" in the message.
 */
function extractTaskIds(message: string): string[] {
  const pattern = /TASK-([a-z0-9]+)/gi;
  const matches = [...message.matchAll(pattern)];
  return [...new Set(matches.map((m) => m[1]))];
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await requireGitHubProjectAccess(
      projectId,
      session.user.id,
      {
        requireConnectedRepo: true,
      },
    );
    const accessToken = await requireGitHubAccessToken(session.user.id);

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    };

    // Fetch recent commits from default branch
    const baseUrl = `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/commits`;
    const params = new URLSearchParams({
      per_page: "100",
    });

    const res = await fetch(`${baseUrl}?${params}`, { headers });
    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json(
        { error: `GitHub API error: ${error}` },
        { status: 502 },
      );
    }

    const ghCommits: GitHubCommitResponse[] = await res.json();

    // Get valid task IDs for this project
    const boardTasks = project.board
      ? await prisma.task.findMany({
          where: { boardId: project.board.id },
          select: { id: true },
        })
      : [];
    const validTaskIds = new Set(boardTasks.map((t) => t.id));

    let linked = 0;
    let updated = 0;

    for (const commit of ghCommits) {
      const taskIds = extractTaskIds(commit.commit.message);
      const matchedTaskId = taskIds.find((id) => validTaskIds.has(id)) ?? null;

      const existing = await prisma.gitHubCommit.findUnique({
        where: {
          projectId_sha: { projectId, sha: commit.sha },
        },
      });

      if (existing) {
        // Update task link if we now have a match
        if (matchedTaskId && !existing.taskId) {
          await prisma.gitHubCommit.update({
            where: { id: existing.id },
            data: { taskId: matchedTaskId },
          });
          updated++;
        }
      } else {
        await prisma.gitHubCommit.create({
          data: {
            sha: commit.sha,
            message: commit.commit.message,
            authorName: commit.commit.author?.name,
            authorDate: commit.commit.author?.date
              ? new Date(commit.commit.author.date)
              : null,
            url: commit.html_url,
            taskId: matchedTaskId,
            projectId,
          },
        });
        linked++;
      }
    }

    await prisma.gitHubSyncLog.create({
      data: {
        projectId,
        action: "COMMIT_LINKED",
        details: { linked, updated, total: ghCommits.length },
      },
    });

    return NextResponse.json({ linked, updated, total: ghCommits.length });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
