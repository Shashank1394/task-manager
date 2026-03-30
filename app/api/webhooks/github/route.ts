import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Verify GitHub webhook signature (HMAC SHA-256).
 */
function verifySignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Extract task IDs from text.
 * Looks for patterns like "TASK-clxyz123" in titles, bodies, branch names, and messages.
 */
function extractTaskIds(text: string): string[] {
  const pattern = /TASK-([a-z0-9]+)/gi;
  const matches = [...text.matchAll(pattern)];
  return [...new Set(matches.map((m) => m[1]))];
}

/**
 * POST /api/webhooks/github
 * Receives GitHub webhook events and processes them.
 */
export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const event = req.headers.get("x-github-event");
    const deliveryId = req.headers.get("x-github-delivery");

    if (!event) {
      return NextResponse.json(
        { error: "Missing x-github-event header" },
        { status: 400 },
      );
    }

    // Parse payload to find the repository
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 },
      );
    }

    const repo = payload.repository as
      | { full_name?: string; owner?: { login?: string }; name?: string }
      | undefined;

    if (!repo?.owner?.login || !repo?.name) {
      // Ping event or unknown — acknowledge
      if (event === "ping") {
        return NextResponse.json({ message: "pong" });
      }
      return NextResponse.json(
        { error: "Cannot determine repository" },
        { status: 400 },
      );
    }

    // Find the project with matching repo + webhook secret
    const project = await prisma.project.findFirst({
      where: {
        repoOwner: repo.owner.login,
        repoName: repo.name,
        webhookSecret: { not: null },
      },
      include: { board: true },
    });

    if (!project || !project.webhookSecret) {
      return NextResponse.json(
        { error: "No matching project found" },
        { status: 404 },
      );
    }

    // Verify signature
    if (!verifySignature(body, signature, project.webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Get valid task IDs for this project
    const boardTasks = project.board
      ? await prisma.task.findMany({
          where: { boardId: project.board.id },
          select: { id: true },
        })
      : [];
    const validTaskIds = new Set(boardTasks.map((t) => t.id));

    // Process events
    let action = "WEBHOOK_RECEIVED";
    let details: {
      event: string;
      deliveryId: string | null;
      subtype?: string;
    } = { event, deliveryId };

    switch (event) {
      case "issues": {
        await handleIssueEvent(
          payload as IssueEventPayload,
          project.id,
          project.board?.id,
        );
        action = "WEBHOOK_RECEIVED";
        details = { ...details, subtype: "issues" };
        break;
      }
      case "pull_request": {
        await handlePullRequestEvent(
          payload as PullRequestEventPayload,
          project.id,
          validTaskIds,
        );
        action = "WEBHOOK_RECEIVED";
        details = { ...details, subtype: "pull_request" };
        break;
      }
      case "push": {
        await handlePushEvent(
          payload as PushEventPayload,
          project.id,
          validTaskIds,
        );
        action = "WEBHOOK_RECEIVED";
        details = { ...details, subtype: "push" };
        break;
      }
      case "ping": {
        details = { ...details, subtype: "ping" };
        break;
      }
      default: {
        details = { ...details, subtype: event };
        break;
      }
    }

    // Log the event
    await prisma.gitHubSyncLog.create({
      data: {
        projectId: project.id,
        action: action as "WEBHOOK_RECEIVED",
        details,
      },
    });

    return NextResponse.json({ received: true, event });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Always return 200 to GitHub to avoid retries on our errors
    return NextResponse.json({ received: true, error: "Processing failed" });
  }
}

// ─── Event Types ─────────────────────────────────────────────

type IssueEventPayload = {
  action: string;
  issue: {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    body: string | null;
    labels: { name: string }[];
    assignee: { login: string } | null;
  };
};

type PullRequestEventPayload = {
  action: string;
  pull_request: {
    id: number;
    number: number;
    title: string;
    state: string;
    merged: boolean;
    merged_at: string | null;
    html_url: string;
    body: string | null;
    user: { login: string } | null;
    head: { ref: string };
  };
};

type PushEventPayload = {
  ref: string;
  commits: {
    id: string;
    message: string;
    url: string;
    author: { name: string; date?: string };
    timestamp: string;
  }[];
};

// ─── Issue Handler ───────────────────────────────────────────

async function handleIssueEvent(
  payload: IssueEventPayload,
  projectId: string,
  boardId: string | undefined,
) {
  const { action, issue } = payload;

  // Find linked task via GitHubIssue record
  const ghIssue = await prisma.gitHubIssue.findUnique({
    where: {
      projectId_githubIssueNumber: {
        projectId,
        githubIssueNumber: issue.number,
      },
    },
    include: { task: true },
  });

  if (action === "opened" && !ghIssue && boardId) {
    // Auto-import new issues
    const priorityMap: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
      "priority: high": "HIGH",
      "priority: critical": "HIGH",
      "priority: low": "LOW",
    };

    let priority: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    for (const label of issue.labels) {
      if (priorityMap[label.name.toLowerCase()]) {
        priority = priorityMap[label.name.toLowerCase()];
        break;
      }
    }

    const task = await prisma.task.create({
      data: {
        title: issue.title,
        description: issue.body ?? undefined,
        status: "TODO",
        priority,
        boardId,
        githubIssueUrl: issue.html_url,
      },
    });

    await prisma.gitHubIssue.create({
      data: {
        githubIssueId: BigInt(issue.id),
        githubIssueNumber: issue.number,
        taskId: task.id,
        projectId,
      },
    });
  } else if (ghIssue?.task) {
    // Update linked task based on issue state
    if (action === "closed") {
      await prisma.task.update({
        where: { id: ghIssue.taskId },
        data: { status: "DONE" },
      });
    } else if (action === "reopened") {
      await prisma.task.update({
        where: { id: ghIssue.taskId },
        data: { status: "TODO" },
      });
    } else if (action === "edited") {
      await prisma.task.update({
        where: { id: ghIssue.taskId },
        data: {
          title: issue.title,
          description: issue.body ?? undefined,
        },
      });
    }

    // Update sync timestamp
    await prisma.gitHubIssue.update({
      where: { id: ghIssue.id },
      data: { lastSyncedAt: new Date() },
    });
  }
}

// ─── Pull Request Handler ────────────────────────────────────

async function handlePullRequestEvent(
  payload: PullRequestEventPayload,
  projectId: string,
  validTaskIds: Set<string>,
) {
  const { action, pull_request: pr } = payload;

  const state = pr.merged ? "merged" : pr.state;

  // Upsert PR record
  await prisma.gitHubPR.upsert({
    where: {
      projectId_githubPrNumber: {
        projectId,
        githubPrNumber: pr.number,
      },
    },
    update: { state, title: pr.title },
    create: {
      githubPrId: BigInt(pr.id),
      githubPrNumber: pr.number,
      title: pr.title,
      state,
      url: pr.html_url,
      authorLogin: pr.user?.login,
      projectId,
    },
  });

  // Try to link to a task via TASK-{id} pattern
  const searchText = [pr.title, pr.body ?? "", pr.head.ref].join(" ");
  const taskIds = extractTaskIds(searchText);
  const matchedTaskId = taskIds.find((id) => validTaskIds.has(id));

  if (matchedTaskId) {
    // Link PR to task
    await prisma.gitHubPR.update({
      where: {
        projectId_githubPrNumber: { projectId, githubPrNumber: pr.number },
      },
      data: { taskId: matchedTaskId },
    });

    // Auto-status transitions
    if (action === "opened" || action === "ready_for_review") {
      // PR opened → task IN_PROGRESS
      const task = await prisma.task.findUnique({
        where: { id: matchedTaskId },
      });
      if (task && task.status === "TODO") {
        await prisma.task.update({
          where: { id: matchedTaskId },
          data: { status: "IN_PROGRESS" },
        });
      }
    } else if (action === "closed" && pr.merged) {
      // PR merged → task DONE
      await prisma.task.update({
        where: { id: matchedTaskId },
        data: { status: "DONE" },
      });
    }
  }
}

// ─── Push Handler ────────────────────────────────────────────

async function handlePushEvent(
  payload: PushEventPayload,
  projectId: string,
  validTaskIds: Set<string>,
) {
  for (const commit of payload.commits) {
    const taskIds = extractTaskIds(commit.message);
    const matchedTaskId = taskIds.find((id) => validTaskIds.has(id));

    await prisma.gitHubCommit.upsert({
      where: {
        projectId_sha: { projectId, sha: commit.id },
      },
      update: { taskId: matchedTaskId ?? undefined },
      create: {
        sha: commit.id,
        message: commit.message,
        authorName: commit.author.name,
        authorDate: commit.timestamp ? new Date(commit.timestamp) : null,
        url: commit.url,
        taskId: matchedTaskId ?? null,
        projectId,
      },
    });
  }
}
