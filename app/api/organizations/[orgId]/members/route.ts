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

const roleSchema = z.enum(["ADMIN", "MEMBER", "CLIENT"]);

const inviteMemberSchema = z.object({
  email: z.string().trim().email(),
  role: roleSchema.optional(),
});

const updateMemberSchema = z.object({
  memberId: z.string().trim().min(1),
  role: roleSchema,
});

const deleteMemberSchema = z.object({
  memberId: z.string().trim().min(1),
});

async function getOrgRequester(orgId: string, userId: string) {
  return prisma.organizationMember.findFirst({
    where: { organizationId: orgId, userId },
  });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;
    const session = await requireAuth();

    // Check that the requesting user is a member
    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      throw forbidden("Forbidden");
    }

    // Clients cannot view the members list
    if (membership.role === "CLIENT") {
      throw forbidden("Forbidden");
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { role: "asc" },
    });

    return NextResponse.json(members);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

/**
 * POST — Invite a member by email.
 * Only ADMINs can invite.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;
    const session = await requireAuth();

    // Check requester is admin
    const requester = await getOrgRequester(orgId, session.user.id);
    if (!requester || requester.role !== "ADMIN") {
      throw forbidden("Only admins can invite members");
    }

    const parsed = inviteMemberSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid member invite payload", parsed.error.flatten());
    }

    const { email, role } = parsed.data;

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw notFound("No user found with that email. They must sign up first.");
    }

    // Check if already a member
    const existing = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: orgId,
        },
      },
    });
    if (existing) {
      throw conflict("User is already a member");
    }

    const memberRole = role ?? "MEMBER";

    const member = await prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        role: memberRole,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

/**
 * PATCH — Update a member's role.
 * Only ADMINs can change roles. Cannot demote the last admin.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;
    const session = await requireAuth();

    const requester = await getOrgRequester(orgId, session.user.id);
    if (!requester || requester.role !== "ADMIN") {
      throw forbidden("Only admins can change roles");
    }

    const parsed = updateMemberSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid member update payload", parsed.error.flatten());
    }

    const { memberId, role } = parsed.data;

    const target = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!target || target.organizationId !== orgId) {
      throw notFound("Member not found");
    }

    // Prevent demoting the last admin
    if (target.role === "ADMIN" && role !== "ADMIN") {
      const adminCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: "ADMIN" },
      });
      if (adminCount <= 1) {
        throw badRequest("Cannot remove the last admin");
      }
    }

    const updated = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: role as "ADMIN" | "MEMBER" | "CLIENT" },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

/**
 * DELETE — Remove a member from the org.
 * ADMINs can remove anyone (except last admin). Members can leave themselves.
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;
    const session = await requireAuth();

    const requester = await getOrgRequester(orgId, session.user.id);
    if (!requester) {
      throw forbidden("Forbidden");
    }

    const parsed = deleteMemberSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest(
        "Invalid member removal payload",
        parsed.error.flatten(),
      );
    }

    const { memberId } = parsed.data;

    const target = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!target || target.organizationId !== orgId) {
      throw notFound("Member not found");
    }

    // Non-admins can only remove themselves
    if (requester.role !== "ADMIN" && target.userId !== session.user.id) {
      throw forbidden("Only admins can remove other members");
    }

    // Prevent removing the last admin
    if (target.role === "ADMIN") {
      const adminCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: "ADMIN" },
      });
      if (adminCount <= 1) {
        throw badRequest("Cannot remove the last admin");
      }
    }

    await prisma.organizationMember.delete({ where: { id: memberId } });

    return NextResponse.json({ removed: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
