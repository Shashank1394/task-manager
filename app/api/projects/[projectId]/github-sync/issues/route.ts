import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError, unauthorized } from "@/lib/api-errors";
import {
  requireGitHubAccessToken,
  requireGitHubProjectAccess,
} from "@/lib/github-route";

type GitHubIssueResponse = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: { name: string }[];
  assignee: { login: string } | null;
  created_at: string;
};

function mapPriority(labels: { name: string }[]): "LOW" | "MEDIUM" | "HIGH" {
  const names = labels.map((l) => l.name.toLowerCase());
  if (
    names.some(
      (n) =>
        n.includes("critical") ||
        n.includes("urgent") ||
        n === "priority: high" ||
        n === "p0" ||
        n === "p1",
    )
  ) {
    return "HIGH";
  }
  if (
    names.some((n) => n.includes("low") || n === "priority: low" || n === "p3")
  ) {
    return "LOW";
  }
  return "MEDIUM";
}

function mapStatus(state: string): "TODO" | "IN_PROGRESS" | "DONE" {
  if (state === "closed") return "DONE";
  return "TODO";
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
      { requireConnectedRepo: true, requireBoard: true },
    );
    const accessToken = await requireGitHubAccessToken(session.user.id);

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    };

    // Get the last sync time to do incremental sync
    const lastSync = await prisma.gitHubIssue.findFirst({
      where: { projectId },
      orderBy: { lastSyncedAt: "desc" },
    });

    const baseUrl = `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/issues`;
    const params = new URLSearchParams({
      state: "all",
      per_page: "100",
      sort: "updated",
      direction: "desc",
    });

    if (lastSync) {
      params.set("since", lastSync.lastSyncedAt.toISOString());
    }

    const res = await fetch(`${baseUrl}?${params}`, { headers });

    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json(
        { error: `GitHub API error: ${error}` },
        { status: 502 },
      );
    }

    const ghIssues: GitHubIssueResponse[] = await res.json();

    // Filter out pull requests (GitHub API returns PRs as issues too)
    const issues = ghIssues.filter(
      (i) =>
        !("pull_request" in i && (i as Record<string, unknown>).pull_request),
    );

    let imported = 0;
    let updated = 0;

    for (const issue of issues) {
      await prisma.$transaction(async (tx) => {
        // Check inside the transaction to avoid race conditions
        const existing = await tx.gitHubIssue.findUnique({
          where: {
            projectId_githubIssueNumber: {
              projectId,
              githubIssueNumber: issue.number,
            },
          },
        });

        if (existing) {
          // Update existing task — preserve user-set status for open issues
          await tx.task.update({
            where: { id: existing.taskId },
            data: {
              title: issue.title,
              description: issue.body,
              ...(issue.state === "closed" ? { status: "DONE" } : {}),
              priority: mapPriority(issue.labels),
              githubIssueUrl: issue.html_url,
            },
          });
          await tx.gitHubIssue.update({
            where: { taskId: existing.taskId },
            data: { lastSyncedAt: new Date() },
          });
          updated++;
        } else {
          // Atomically create task + GitHubIssue link
          await tx.task.create({
            data: {
              title: issue.title,
              description: issue.body,
              status: mapStatus(issue.state),
              priority: mapPriority(issue.labels),
              boardId: project.board!.id,
              githubIssueUrl: issue.html_url,
              githubIssue: {
                create: {
                  githubIssueId: issue.id,
                  githubIssueNumber: issue.number,
                  projectId,
                  syncDirection: "IMPORTED",
                },
              },
            },
          });
          imported++;
        }
      });
    }

    // Log the sync
    await prisma.gitHubSyncLog.create({
      data: {
        projectId,
        action: lastSync ? "ISSUE_UPDATED" : "ISSUE_IMPORTED",
        details: { imported, updated, total: issues.length },
      },
    });

    return NextResponse.json({ imported, updated, total: issues.length });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
