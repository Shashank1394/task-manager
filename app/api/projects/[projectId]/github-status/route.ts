import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError, unauthorized } from "@/lib/api-errors";
import {
  requireGitHubAccessToken,
  requireGitHubProjectAccess,
} from "@/lib/github-route";

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await requireGitHubProjectAccess(
      projectId,
      session.user.id,
      {
        requireConnectedRepo: true,
      },
    );
    const accessToken = await requireGitHubAccessToken(
      session.user.id,
      "GitHub not connected",
    );

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    };

    const baseUrl = `https://api.github.com/repos/${project.repoOwner}/${project.repoName}`;

    // Fetch repo details
    const repoRes = await fetch(baseUrl, { headers });
    if (!repoRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch repository" },
        { status: 500 },
      );
    }

    const repo = await repoRes.json();

    // Fetch latest commit
    const commitsRes = await fetch(`${baseUrl}/commits?per_page=1`, {
      headers,
    });

    const commits = commitsRes.ok ? await commitsRes.json() : [];

    const latestCommit = commits[0] ?? null;

    // Fetch open PRs
    const pullsRes = await fetch(`${baseUrl}/pulls?state=open`, { headers });

    const pulls = pullsRes.ok ? await pullsRes.json() : [];

    return NextResponse.json({
      repository: {
        name: repo.full_name,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        defaultBranch: repo.default_branch,
        visibility: repo.visibility ?? (repo.private ? "private" : "public"),
        isArchived: Boolean(repo.archived),
        primaryLanguage: repo.language ?? null,
        pushedAt: repo.pushed_at ?? null,
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}
