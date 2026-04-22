import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { Role } from "@prisma/client";
import {
  badRequest,
  forbidden,
  handleRouteError,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const patchOrganizationSchema = z.object({
  name: z.string().trim().min(3).max(120),
});

async function getAdminMembership(orgId: string, userId: string) {
  return prisma.organizationMember.findFirst({
    where: { organizationId: orgId, userId },
  });
}

// PATCH — rename organization (admin only)
export async function PATCH(
  req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;

  try {
    const session = await requireAuth();
    const parsed = patchOrganizationSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest(
        "Invalid organization update payload",
        parsed.error.flatten(),
      );
    }

    const membership = await getAdminMembership(orgId, session.user.id);

    if (!membership || membership.role !== Role.ADMIN) {
      throw forbidden("Admin access required");
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: { name: parsed.data.name },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

// DELETE — delete organization and all data (admin only)
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;

  try {
    const session = await requireAuth();

    const membership = await getAdminMembership(orgId, session.user.id);

    if (!membership || membership.role !== Role.ADMIN) {
      throw forbidden("Admin access required");
    }

    // The Prisma schema already defines cascading deletes from Organization.
    await prisma.organization.delete({ where: { id: orgId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
