import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { Role } from "@prisma/client";
import { badRequest, handleRouteError, unauthorized } from "@/lib/api-errors";
import { z } from "zod";

const createOrganizationSchema = z.object({
  name: z.string().trim().min(3).max(120),
});

// CREATE organization
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const parsed = createOrganizationSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid organization payload", parsed.error.flatten());
    }

    const organization = await prisma.organization.create({
      data: {
        name: parsed.data.name,
        members: {
          create: {
            userId: session.user.id,
            role: Role.ADMIN,
          },
        },
      },
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

// LIST organizations for current user
export async function GET() {
  try {
    const session = await requireAuth();

    const organizations = await prisma.organization.findMany({
      where: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        members: {
          where: {
            userId: session.user.id,
          },
          select: {
            role: true,
          },
        },
      },
    });

    return NextResponse.json(organizations);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
