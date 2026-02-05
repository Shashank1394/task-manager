import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { Role } from "@prisma/client";

// CREATE organization
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const { name } = await req.json();

    if (!name || name.trim().length < 3) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 },
      );
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        members: {
          create: {
            userId: session.user.id,
            role: Role.ADMIN,
          },
        },
      },
    });

    return NextResponse.json(organization, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
