import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { TaskStatus } from "@prisma/client";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  const session = await requireAuth();

  const { status, assigneeId } = await req.json();

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      board: {
        project: {
          organization: {
            members: {
              some: { userId: session.user.id },
            },
          },
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: status as TaskStatus,
      assigneeId,
    },
  });

  return NextResponse.json(updated);
}
