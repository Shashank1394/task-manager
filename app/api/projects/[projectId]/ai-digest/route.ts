import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError, notFound, unauthorized } from "@/lib/api-errors";
import { maybeGenerateDigestWithModel } from "@/lib/ai-digest";

type DigestTask = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  dueDate: Date | null;
  assigneeId: string | null;
  sprintId: string | null;
};

type DigestSprint = {
  id: string;
  name: string;
  status: "PLANNING" | "ACTIVE" | "COMPLETED";
};

type DigestActivity = {
  message: string;
  createdAt: Date;
};

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function buildRuleDigest(project: {
  name: string;
  clients: { id: string }[];
  sprints: DigestSprint[];
  activities: DigestActivity[];
  board: { tasks: DigestTask[] } | null;
}) {
  const tasks = project.board?.tasks ?? [];
  const now = Date.now();
  const doneCount = tasks.filter((task) => task.status === "DONE").length;
  const inProgressCount = tasks.filter(
    (task) => task.status === "IN_PROGRESS",
  ).length;
  const todoCount = tasks.filter((task) => task.status === "TODO").length;
  const openTasks = tasks.filter((task) => task.status !== "DONE");
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate && task.dueDate.getTime() < now,
  );
  const unassignedOpenTasks = openTasks.filter((task) => !task.assigneeId);
  const activeSprint =
    project.sprints.find((sprint) => sprint.status === "ACTIVE") ?? null;
  const scopedTasks = activeSprint
    ? tasks.filter((task) => task.sprintId === activeSprint.id)
    : [];
  const scopedDoneCount = scopedTasks.filter(
    (task) => task.status === "DONE",
  ).length;
  const scopedInProgressCount = scopedTasks.filter(
    (task) => task.status === "IN_PROGRESS",
  ).length;
  const scopedTodoCount = scopedTasks.filter(
    (task) => task.status === "TODO",
  ).length;
  const recentActivity = project.activities[0] ?? null;

  const summary =
    activeSprint && scopedTasks.length > 0
      ? `${project.name} is running ${activeSprint.name} with ${pluralize(scopedDoneCount, "scoped task")} done, ${pluralize(scopedInProgressCount, "task")} in progress, and ${pluralize(scopedTodoCount, "task")} still queued.`
      : `${project.name} currently has ${pluralize(doneCount, "task")} complete, ${pluralize(inProgressCount, "task")} in progress, and ${pluralize(todoCount, "task")} still open.`;

  const highlights = [
    activeSprint
      ? `${activeSprint.name} is the active sprint with ${pluralize(scopedTasks.length, "task")} scoped.`
      : "No active sprint is set yet, so work is still being managed directly from the board.",
    recentActivity
      ? `Latest delivery signal: ${recentActivity.message}`
      : "No recent activity has been logged for this project yet.",
    project.clients.length > 0
      ? `${pluralize(project.clients.length, "client stakeholder")} currently have access to this project.`
      : "No client stakeholders are currently attached to this project.",
  ];

  const risks = [
    ...(overdueTasks.length > 0
      ? [
          `${pluralize(overdueTasks.length, "overdue task")} ${overdueTasks.length === 1 ? "needs" : "need"} attention before the schedule slips further.`,
        ]
      : []),
    ...(unassignedOpenTasks.length > 0
      ? [
          `${pluralize(unassignedOpenTasks.length, "open task")} still ${unassignedOpenTasks.length === 1 ? "does not have" : "do not have"} an owner.`,
        ]
      : []),
    ...(activeSprint &&
    scopedTodoCount > scopedDoneCount + scopedInProgressCount
      ? [
          `Most scoped sprint work has not started yet, which could put ${activeSprint.name} behind pace.`,
        ]
      : []),
  ];

  if (risks.length === 0) {
    risks.push(
      "No immediate delivery risks stand out from the current board signals.",
    );
  }

  const nextSteps = [
    ...(overdueTasks.length > 0
      ? [
          `Re-sequence or unblock ${overdueTasks[0]!.title} and confirm who is driving it.`,
        ]
      : []),
    ...(unassignedOpenTasks.length > 0
      ? ["Assign owners to the remaining open work so accountability is clear."]
      : []),
    ...(activeSprint && scopedTodoCount > 0
      ? [
          "Pull the next ready sprint task into progress to keep delivery moving.",
        ]
      : []),
  ];

  if (nextSteps.length === 0) {
    nextSteps.push(
      "Keep logging delivery activity so the next brief can call out trend changes earlier.",
    );
  }

  return {
    source: "rules" as const,
    generatedAt: new Date().toISOString(),
    summary,
    highlights,
    risks,
    nextSteps,
    snapshot: {
      totalTasks: tasks.length,
      doneTasks: doneCount,
      inProgressTasks: inProgressCount,
      todoTasks: todoCount,
      overdueTasks: overdueTasks.length,
      unassignedOpenTasks: unassignedOpenTasks.length,
      clientCount: project.clients.length,
      activeSprintName: activeSprint?.name ?? null,
    },
  };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          members: { some: { userId: session.user.id } },
        },
      },
      select: {
        name: true,
        clients: { select: { id: true } },
        sprints: {
          select: { id: true, name: true, status: true },
          orderBy: { createdAt: "desc" },
        },
        activities: {
          select: { message: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        board: {
          select: {
            tasks: {
              select: {
                id: true,
                title: true,
                status: true,
                dueDate: true,
                assigneeId: true,
                sprintId: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw notFound("Not found");
    }

    const fallback = buildRuleDigest(project);

    const digest = await maybeGenerateDigestWithModel({
      audience: "internal product and delivery team",
      fallback,
      voice:
        "an engineering operations analyst writing short, decisive internal delivery briefs",
      instructions: [
        "Call out overdue task names directly when they appear in context.",
        "Mention ownership gaps when unassigned work is present.",
        "If a sprint is active, anchor the brief around that sprint instead of speaking abstractly.",
      ],
      context: {
        projectName: project.name,
        snapshot: fallback.snapshot,
        activeSprint:
          project.sprints.find((sprint) => sprint.status === "ACTIVE") ?? null,
        recentActivities: project.activities.map(
          (activity) => activity.message,
        ),
        overdueTasks: (project.board?.tasks ?? [])
          .filter(
            (task) =>
              task.status !== "DONE" &&
              task.dueDate &&
              task.dueDate.getTime() < Date.now(),
          )
          .map((task) => task.title)
          .slice(0, 3),
        unassignedOpenTasks: (project.board?.tasks ?? [])
          .filter((task) => task.status !== "DONE" && !task.assigneeId)
          .map((task) => task.title)
          .slice(0, 3),
      },
    });

    return NextResponse.json(digest);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
