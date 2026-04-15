import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type LogActivityParams = {
  type: string;
  message: string;
  userId: string;
  projectId: string;
  taskId?: string | null;
  meta?: Prisma.InputJsonValue;
};

export async function logActivity(params: LogActivityParams) {
  try {
    await prisma.activity.create({
      data: {
        type: params.type,
        message: params.message,
        userId: params.userId,
        projectId: params.projectId,
        taskId: params.taskId ?? null,
        meta: params.meta ?? undefined,
      },
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}

export async function notify(
  userId: string,
  type: string,
  message: string,
  link?: string,
) {
  try {
    await prisma.notification.create({
      data: { userId, type, message, link },
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}
