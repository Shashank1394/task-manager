import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import {
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import { maybeGenerateDigestWithModel } from "@/lib/ai-digest";

type ClientProjectSummary = {
  id: string;
  name: string;
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  completionPct: number;
};

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function buildClientRuleDigest(payload: {
  organizationName: string;
  projects: ClientProjectSummary[];
}) {
  const totalTasks = payload.projects.reduce(
    (sum, project) => sum + project.total,
    0,
  );
  const totalDone = payload.projects.reduce(
    (sum, project) => sum + project.done,
    0,
  );
  const totalInProgress = payload.projects.reduce(
    (sum, project) => sum + project.inProgress,
    0,
  );
  const totalTodo = payload.projects.reduce(
    (sum, project) => sum + project.todo,
    0,
  );
  const overallCompletion =
    totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
  const highestCompletionProject =
    [...payload.projects].sort(
      (left, right) => right.completionPct - left.completionPct,
    )[0] ?? null;
  const mostActiveProject =
    [...payload.projects].sort(
      (left, right) => right.inProgress - left.inProgress,
    )[0] ?? null;

  const summary =
    payload.projects.length > 0
      ? `${payload.organizationName} currently has ${pluralize(payload.projects.length, "project")} in view with ${overallCompletion}% of tracked work completed overall.`
      : `${payload.organizationName} does not have any client-visible projects to summarize yet.`;

  const highlights = [
    payload.projects.length > 0
      ? `${pluralize(totalDone, "task")} ${totalDone === 1 ? "is" : "are"} complete across the visible portfolio.`
      : "No active project work is visible yet.",
    highestCompletionProject
      ? `${highestCompletionProject.name} is the furthest along at ${highestCompletionProject.completionPct}% complete.`
      : "No project completion trend is available yet.",
    mostActiveProject && mostActiveProject.inProgress > 0
      ? `${mostActiveProject.name} currently has the most active delivery work underway.`
      : "No project currently shows active in-progress work.",
  ];

  const risks = [
    ...(totalTodo > totalDone + totalInProgress
      ? [
          "Most visible work is still queued, so the delivery picture may move slowly until more tasks enter progress.",
        ]
      : []),
    ...(payload.projects.some(
      (project) => project.total > 0 && project.done === 0,
    )
      ? [
          "At least one visible project has not shipped any completed tasks yet.",
        ]
      : []),
  ];

  if (risks.length === 0) {
    risks.push(
      "No major delivery concerns stand out from the current client-visible progress snapshot.",
    );
  }

  const nextSteps = [
    ...(mostActiveProject && mostActiveProject.inProgress > 0
      ? [
          `Track ${mostActiveProject.name} for the next concrete delivery update.`,
        ]
      : []),
    ...(highestCompletionProject
      ? [
          `Use ${highestCompletionProject.name} as the clearest proof point in the next client update.`,
        ]
      : []),
  ];

  if (nextSteps.length === 0) {
    nextSteps.push(
      "Check back after more task progress is recorded to generate a stronger client brief.",
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
      projectCount: payload.projects.length,
      totalTasks,
      totalDone,
      totalInProgress,
      totalTodo,
      overallCompletion,
    },
  };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;
    const session = await requireAuth();

    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      throw forbidden("Forbidden");
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!organization) {
      throw notFound("Not found");
    }

    let projectFilter: { organizationId: string; id?: { in: string[] } } = {
      organizationId: orgId,
    };

    if (membership.role === "CLIENT") {
      const allowedProjects = await prisma.projectClient.findMany({
        where: { userId: session.user.id, project: { organizationId: orgId } },
        select: { projectId: true },
      });

      projectFilter = {
        organizationId: orgId,
        id: { in: allowedProjects.map((project) => project.projectId) },
      };
    }

    const projects = await prisma.project.findMany({
      where: projectFilter,
      include: {
        board: {
          include: {
            tasks: {
              select: { status: true },
            },
          },
        },
      },
    });

    const summaries: ClientProjectSummary[] = projects.map((project) => {
      const tasks = project.board?.tasks ?? [];
      const total = tasks.length;
      const done = tasks.filter((task) => task.status === "DONE").length;
      const inProgress = tasks.filter(
        (task) => task.status === "IN_PROGRESS",
      ).length;
      const todo = tasks.filter((task) => task.status === "TODO").length;

      return {
        id: project.id,
        name: project.name,
        total,
        todo,
        inProgress,
        done,
        completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });

    const fallback = buildClientRuleDigest({
      organizationName: organization.name,
      projects: summaries,
    });

    const digest = await maybeGenerateDigestWithModel({
      audience: "client stakeholder",
      fallback,
      voice: "a delivery lead writing calm, external-facing client updates",
      instructions: [
        "Use visible project names and completion percentages as proof points.",
        "Keep the language externally shareable and delivery-oriented.",
        "Do not mention staffing, ownership gaps, or hidden internal blockers.",
      ],
      context: {
        organizationName: organization.name,
        snapshot: fallback.snapshot,
        projects: summaries.map((project) => ({
          name: project.name,
          completionPct: project.completionPct,
          total: project.total,
          done: project.done,
          inProgress: project.inProgress,
          todo: project.todo,
        })),
        constraints: [
          "Keep the wording client-safe and delivery-oriented.",
          "Do not mention internal staffing, ownership gaps, or any hidden member details.",
        ],
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
