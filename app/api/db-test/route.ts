import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const usersCount = await prisma.user.count();
    return NextResponse.json({
      db: "connected",
      users: usersCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { db: "error", error: String(error) },
      { status: 500 },
    );
  }
}
