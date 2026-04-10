import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Clients cannot view the members list
    if (membership.role === "CLIENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const requester = await prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: session.user.id },
    });
    if (!requester || requester.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can invite members" },
        { status: 403 },
      );
    }

    const { email, role } = (await req.json()) as {
      email?: string;
      role?: string;
    };

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 },
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "No user found with that email. They must sign up first." },
        { status: 404 },
      );
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
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 409 },
      );
    }

    const validRoles = ["ADMIN", "MEMBER", "CLIENT"] as const;
    const memberRole = validRoles.includes(role as (typeof validRoles)[number])
      ? (role as "ADMIN" | "MEMBER" | "CLIENT")
      : "MEMBER";

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
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Invite member error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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

    const requester = await prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: session.user.id },
    });
    if (!requester || requester.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can change roles" },
        { status: 403 },
      );
    }

    const { memberId, role } = (await req.json()) as {
      memberId?: string;
      role?: string;
    };

    if (!memberId || !role || !["ADMIN", "MEMBER", "CLIENT"].includes(role)) {
      return NextResponse.json(
        { error: "memberId and role (ADMIN, MEMBER, or CLIENT) are required" },
        { status: 400 },
      );
    }

    const target = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!target || target.organizationId !== orgId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent demoting the last admin
    if (target.role === "ADMIN" && role !== "ADMIN") {
      const adminCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: "ADMIN" },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin" },
          { status: 400 },
        );
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
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Update role error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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

    const requester = await prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: session.user.id },
    });
    if (!requester) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { memberId } = (await req.json()) as { memberId?: string };
    if (!memberId) {
      return NextResponse.json(
        { error: "memberId is required" },
        { status: 400 },
      );
    }

    const target = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!target || target.organizationId !== orgId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Non-admins can only remove themselves
    if (requester.role !== "ADMIN" && target.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Only admins can remove other members" },
        { status: 403 },
      );
    }

    // Prevent removing the last admin
    if (target.role === "ADMIN") {
      const adminCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: "ADMIN" },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin" },
          { status: 400 },
        );
      }
    }

    await prisma.organizationMember.delete({ where: { id: memberId } });

    return NextResponse.json({ removed: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
