import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth-server";
import {
  badRequest,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import {
  buildRuleTaskDraft,
  maybeGenerateTaskDraftWithModel,
} from "@/lib/ai-task-draft";
import { prisma } from "@/lib/prisma";

const taskDraftSchema = z.object({
  rawText: z.string().trim().min(12).max(4000),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const parsed = taskDraftSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid task draft payload", parsed.error.flatten());
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          members: {
            some: {
              userId: session.user.id,
              role: { not: "CLIENT" },
            },
          },
        },
      },
      select: {
        name: true,
        description: true,
        sprints: {
          select: { id: true, name: true, status: true, goal: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        board: {
          select: {
            tasks: {
              select: { title: true, status: true, priority: true },
              orderBy: { createdAt: "desc" },
              take: 6,
            },
          },
        },
      },
    });

    if (!project) {
      throw notFound("Not found");
    }

    const activeSprint =
      project.sprints.find((sprint) => sprint.status === "ACTIVE") ?? null;
    const fallback = buildRuleTaskDraft({
      rawText: parsed.data.rawText,
      projectName: project.name,
      activeSprintName: activeSprint?.name ?? null,
    });

    const draft = await maybeGenerateTaskDraftWithModel({
      fallback,
      context: {
        projectName: project.name,
        projectDescription: project.description,
        activeSprint,
        recentTaskTitles: (project.board?.tasks ?? []).map(
          (task) => task.title,
        ),
        rawText: parsed.data.rawText,
      },
    });

    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }

    return handleRouteError(error);
  }
}
