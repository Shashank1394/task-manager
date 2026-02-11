import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    // 1️⃣ Get project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: {
          include: { members: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 2️⃣ Check membership
    const isMember = project.organization.members.some(
      (m) => m.userId === session.user.id,
    );

    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3️⃣ Check GitHub repo attached
    if (
      project.repoProvider !== "GITHUB" ||
      !project.repoOwner ||
      !project.repoName
    ) {
      return NextResponse.json(
        { error: "GitHub repository not connected" },
        { status: 400 },
      );
    }

    // 4️⃣ Get GitHub account + token
    const githubAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "github",
      },
    });

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { error: "GitHub not connected" },
        { status: 400 },
      );
    }

    const headers = {
      Authorization: `Bearer ${githubAccount.access_token}`,
      Accept: "application/vnd.github+json",
    };

    const baseUrl = `https://api.github.com/repos/${project.repoOwner}/${project.repoName}`;

    // 5️⃣ Fetch repo details
    const repoRes = await fetch(baseUrl, { headers });
    if (!repoRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch repository" },
        { status: 500 },
      );
    }

    const repo = await repoRes.json();

    // 6️⃣ Fetch latest commit
    const commitsRes = await fetch(`${baseUrl}/commits?per_page=1`, {
      headers,
    });

    const commits = commitsRes.ok ? await commitsRes.json() : [];

    const latestCommit = commits[0] ?? null;

    // 7️⃣ Fetch open PRs
    const pullsRes = await fetch(`${baseUrl}/pulls?state=open`, { headers });

    const pulls = pullsRes.ok ? await pullsRes.json() : [];

    return NextResponse.json({
      repository: {
        name: repo.full_name,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        defaultBranch: repo.default_branch,
      },
      latestCommit: latestCommit
        ? {
            message: latestCommit.commit.message,
            author: latestCommit.commit.author.name,
            date: latestCommit.commit.author.date,
          }
        : null,
      openPullRequests: pulls.length,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
