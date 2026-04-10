import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

type GitHubPRResponse = {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string } | null;
  head: { ref: string };
  body: string | null;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Try to match a PR to a task by looking for task IDs in:
 * 1. PR title (e.g. "TASK-clxyz123 fix login")
 * 2. PR body (e.g. "Resolves TASK-clxyz123")
 * 3. Branch name (e.g. "task/clxyz123/fix-login")
 */
function extractTaskIds(
  title: string,
  body: string | null,
  branchName: string,
): string[] {
  const pattern = /TASK-([a-z0-9]+)/gi;
  const combined = `${title} ${body ?? ""} ${branchName}`;
  const matches = [...combined.matchAll(pattern)];
  const ids = [...new Set(matches.map((m) => m[1]))];
  return ids;
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: { include: { members: true } },
        board: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const isMember = project.organization.members.some(
      (m) => m.userId === session.user.id && m.role !== "CLIENT",
    );
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      !project.repoOwner ||
      !project.repoName ||
      project.repoProvider !== "GITHUB"
    ) {
      return NextResponse.json(
        { error: "GitHub repository not connected" },
        { status: 400 },
      );
    }

    const githubAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "github" },
    });

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { error: "GitHub account not connected. Please sign in with GitHub." },
        { status: 400 },
      );
    }

    const headers = {
      Authorization: `Bearer ${githubAccount.access_token}`,
      Accept: "application/vnd.github+json",
    };

    // Fetch PRs (all states)
    const baseUrl = `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/pulls`;
    const params = new URLSearchParams({
      state: "all",
      per_page: "100",
      sort: "updated",
      direction: "desc",
    });

    const res = await fetch(`${baseUrl}?${params}`, { headers });
    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json(
        { error: `GitHub API error: ${error}` },
        { status: 502 },
      );
    }

    const ghPRs: GitHubPRResponse[] = await res.json();

    // Get all task IDs for this project's board to match against
    const boardTasks = project.board
      ? await prisma.task.findMany({
          where: { boardId: project.board.id },
          select: { id: true },
        })
      : [];
    const validTaskIds = new Set(boardTasks.map((t) => t.id));

    let linked = 0;
    let updated = 0;

    for (const pr of ghPRs) {
      const prState = pr.merged_at ? "merged" : pr.state;

      // Check if this PR already exists
      const existing = await prisma.gitHubPR.findUnique({
        where: {
          projectId_githubPrNumber: { projectId, githubPrNumber: pr.number },
        },
      });

      // Try to match to a task
      const taskIds = extractTaskIds(pr.title, pr.body, pr.head.ref);
      const matchedTaskId = taskIds.find((id) => validTaskIds.has(id)) ?? null;

      if (existing) {
        await prisma.gitHubPR.update({
          where: { id: existing.id },
          data: {
            title: pr.title,
            state: prState,
            authorLogin: pr.user?.login,
            taskId: matchedTaskId ?? existing.taskId,
          },
        });
        updated++;
      } else {
        await prisma.gitHubPR.create({
          data: {
            githubPrId: pr.id,
            githubPrNumber: pr.number,
            title: pr.title,
            state: prState,
            url: pr.html_url,
            authorLogin: pr.user?.login,
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
        action: "PR_LINKED",
        details: { linked, updated, total: ghPRs.length },
      },
    });

    return NextResponse.json({ linked, updated, total: ghPRs.length });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GitHub PR sync error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
