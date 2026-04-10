import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

/**
 * POST /api/tasks/[taskId]/github/create-branch
 * Creates a feature branch on GitHub for this task: task/TASK-{id}/{slug}
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    // Get task with project info
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        board: {
          project: {
            organization: {
              members: {
                some: {
                  userId: session.user.id,
                  role: { not: "CLIENT" },
                },
              },
            },
          },
        },
      },
      include: {
        board: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const project = task.board.project;

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
        { error: "GitHub account not connected" },
        { status: 400 },
      );
    }

    const headers = {
      Authorization: `Bearer ${githubAccount.access_token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };

    const repoBase = `https://api.github.com/repos/${project.repoOwner}/${project.repoName}`;

    // Get the default branch SHA
    const repoRes = await fetch(repoBase, { headers });
    if (!repoRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch repository info" },
        { status: 502 },
      );
    }
    const repoData = (await repoRes.json()) as { default_branch: string };

    const refRes = await fetch(
      `${repoBase}/git/ref/heads/${repoData.default_branch}`,
      { headers },
    );
    if (!refRes.ok) {
      return NextResponse.json(
        { error: "Failed to get default branch ref" },
        { status: 502 },
      );
    }
    const refData = (await refRes.json()) as { object: { sha: string } };

    // Create branch name: task/TASK-{id}/{slugified-title}
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const branchName = `task/TASK-${taskId}/${slug}`;

    // Create the branch
    const createRes = await fetch(`${repoBase}/git/refs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      }),
    });

    if (!createRes.ok) {
      const error = await createRes.text();
      // 422 usually means branch already exists
      if (createRes.status === 422) {
        return NextResponse.json(
          { error: "Branch already exists", branchName },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: `Failed to create branch: ${error}` },
        { status: 502 },
      );
    }

    // Log the action
    await prisma.gitHubSyncLog.create({
      data: {
        projectId: project.id,
        action: "BRANCH_CREATED",
        details: { taskId, branchName },
      },
    });

    return NextResponse.json({
      branchName,
      url: `https://github.com/${project.repoOwner}/${project.repoName}/tree/${branchName}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create branch error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
