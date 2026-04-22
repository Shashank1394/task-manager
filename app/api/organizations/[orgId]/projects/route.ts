import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import {
  badRequest,
  forbidden,
  handleRouteError,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
});

async function getOrgMembership(orgId: string, userId: string) {
  return prisma.organizationMember.findFirst({
    where: {
      organizationId: orgId,
      userId,
    },
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;

    const session = await requireAuth();
    const parsed = createProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid project payload", parsed.error.flatten());
    }

    const membership = await getOrgMembership(orgId, session.user.id);

    if (!membership || membership.role === "CLIENT") {
      throw forbidden("Forbidden");
    }

    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        organizationId: orgId,
        board: { create: {} },
      },
      include: { board: true },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;

    const session = await requireAuth();

    const membership = await getOrgMembership(orgId, session.user.id);

    if (!membership || membership.role === "CLIENT") {
      throw forbidden("Forbidden");
    }

    const projects = await prisma.project.findMany({
      where: {
        organizationId: orgId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        board: { select: { id: true } },
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
