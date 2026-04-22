import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkClientProjectAccess } from "@/lib/auth-server";
import { Role } from "@prisma/client";
import {
  badRequest,
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const patchProjectSchema = z
  .object({
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    disconnectGitHub: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Request body must include at least one updatable field",
  });

async function getProjectWithMembers(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      board: { select: { id: true } },
      organization: {
        include: { members: true },
      },
    },
  });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await getProjectWithMembers(projectId);

    if (!project) {
      throw notFound("Project not found");
    }

    const { allowed } = await checkClientProjectAccess(
      session.user.id,
      projectId,
      project.organizationId,
    );

    if (!allowed) {
      throw forbidden("Forbidden");
    }

    if (!project.board) {
      throw notFound("Board not found");
    }

    return NextResponse.json({
      id: project.id,
      name: project.name,
      description: project.description,
      organizationId: project.organizationId,
      board: project.board,
      webhookActive: !!project.webhookId,
      repoOwner: project.repoOwner,
      repoName: project.repoName,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

// DELETE — delete project and all its data (admin only)
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await getProjectWithMembers(projectId);

    if (!project) {
      throw notFound("Project not found");
    }

    const membership = project.organization.members.find(
      (m) => m.userId === session.user.id,
    );

    if (!membership || membership.role !== Role.ADMIN) {
      throw forbidden("Admin access required");
    }

    // The Prisma schema already defines cascading deletes from Project.
    await prisma.project.delete({ where: { id: projectId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

// PATCH — update project settings (admin only)
export async function PATCH(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await getProjectWithMembers(projectId);

    if (!project) {
      throw notFound("Project not found");
    }

    const membership = project.organization.members.find(
      (m) => m.userId === session.user.id,
    );

    if (!membership || membership.role !== Role.ADMIN) {
      throw forbidden("Admin access required");
    }

    const parsed = patchProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest(
        "Invalid project update payload",
        parsed.error.flatten(),
      );
    }

    const body = parsed.data;
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      data.name = body.name;
    }

    if (body.description !== undefined) {
      data.description = body.description || null;
    }

    if (body.disconnectGitHub === true) {
      data.repoProvider = null;
      data.repoOwner = null;
      data.repoName = null;
      data.webhookSecret = null;
      data.webhookId = null;
    }

    if (Object.keys(data).length === 0) {
      throw badRequest("No valid fields");
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      repoOwner: updated.repoOwner,
      repoName: updated.repoName,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
