import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import {
  badRequest,
  conflict,
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const inviteClientSchema = z.object({
  email: z.string().trim().email(),
});

const removeClientSchema = z.object({
  clientId: z.string().trim().min(1),
});

async function getProjectMembership(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      organization: { include: { members: true } },
    },
  });

  if (!project) {
    throw notFound("Project not found");
  }

  const membership = project.organization.members.find(
    (m) => m.userId === userId,
  );

  return { project, membership };
}

/**
 * GET /api/projects/[projectId]/clients
 * List clients assigned to this project.
 * Only org admins/members can view.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const { membership } = await getProjectMembership(
      projectId,
      session.user.id,
    );

    if (!membership || membership.role === "CLIENT") {
      throw forbidden("Forbidden");
    }

    const clients = await prisma.projectClient.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(clients);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

/**
 * POST /api/projects/[projectId]/clients
 * Invite a client to this project by email.
 * Only org admins can add clients.
 * Automatically adds them as CLIENT to the org if not already a member.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const { project, membership } = await getProjectMembership(
      projectId,
      session.user.id,
    );

    if (!membership || membership.role !== "ADMIN") {
      throw forbidden("Only admins can invite clients");
    }

    const parsed = inviteClientSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid client invite payload", parsed.error.flatten());
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw notFound("No user found with that email. They must sign up first.");
    }

    // Check if already a project client
    const existing = await prisma.projectClient.findUnique({
      where: {
        userId_projectId: { userId: user.id, projectId },
      },
    });
    if (existing) {
      throw conflict("User is already a client of this project");
    }

    // Ensure user is an org member (add as CLIENT if not)
    const orgMembership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: project.organizationId,
        },
      },
    });

    if (!orgMembership) {
      await prisma.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: project.organizationId,
          role: "CLIENT",
        },
      });
    }

    // Add as project client
    const projectClient = await prisma.projectClient.create({
      data: {
        userId: user.id,
        projectId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json(projectClient, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]/clients
 * Remove a client from this project.
 * Only org admins can remove clients.
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const { membership } = await getProjectMembership(
      projectId,
      session.user.id,
    );

    if (!membership || membership.role !== "ADMIN") {
      throw forbidden("Only admins can remove clients");
    }

    const parsed = removeClientSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest(
        "Invalid client removal payload",
        parsed.error.flatten(),
      );
    }

    const deleted = await prisma.projectClient.deleteMany({
      where: { id: parsed.data.clientId, projectId },
    });

    if (deleted.count === 0) {
      throw notFound("Project client not found");
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
