// ── Shared GitHub API helpers ────────────────────────────────
function authHeaders() {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

// Parse a GitHub PR URL into { owner, repo, pull_number }
function parsePrUrl(url) {
  try {
    const match = url
      .trim()
      .match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return null;
    return {
      owner: match[1],
      repo: match[2],
      pull_number: parseInt(match[3], 10),
    };
  } catch {
    return null;
  }
}

// ── Manage PRs API ───────────────────────────────────────────
async function approvePr(owner, repo, pull_number) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/reviews`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ event: "APPROVE" }),
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  return response.json();
}

async function mergePr(owner, repo, pull_number) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/merge`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ merge_method: "merge" }),
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  return response.json();
}

async function getPrStatus(owner, repo, pull_number) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`,
    { headers: authHeaders() },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  return response.json();
}

// ── Create PRs API ───────────────────────────────────────────
async function fetchFilteredRepos() {
  let repos = [];
  let page = 1;
  while (true) {
    const response = await fetch(
      `https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}&type=all`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${response.status}`);
    }
    const batch = await response.json();
    if (!batch.length) break;
    repos = repos.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return repos.filter(
    (r) =>
      !r.archived &&
      REPO_PREFIXES.some((p) => r.name.startsWith(p)) &&
      REPO_SUFFIXES.some((s) => r.name.endsWith(s)),
  );
}

async function getExistingPr(owner, repo, head, base) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${head}&base=${base}&state=open`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!response.ok) return null;
  const prs = await response.json();
  return prs[0] || null;
}

async function branchExists(owner, repo, branch) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    { headers: authHeaders() },
  );
  return response.status === 200;
}

async function createPrWithFallback(owner, repo, fromBranches, toBranches) {
  let resolvedFrom = null;
  for (const fromBranch of fromBranches) {
    const exists = await branchExists(owner, repo, fromBranch);
    if (exists) {
      resolvedFrom = fromBranch;
      break;
    }
  }
  if (!resolvedFrom)
    throw new Error(`Branch not found: ${fromBranches.join(", ")}`);

  let resolvedTo = null;
  for (const toBranch of toBranches) {
    const exists = await branchExists(owner, repo, toBranch);
    if (exists) {
      resolvedTo = toBranch;
      break;
    }
  }
  if (!resolvedTo)
    throw new Error(`Branch not found: ${toBranches.join(", ")}`);

  return await createPr(owner, repo, resolvedFrom, resolvedTo);
}

async function createPr(owner, repo, head, base) {
  const title = `Merge ${head} into ${base}`;
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title, head, base }),
    },
  );

  if (response.status === 422) {
    const err = await response.json().catch(() => ({}));
    const errors = err.errors || [];
    const alreadyExists = errors.some((e) =>
      (e.message || "").toLowerCase().includes("already exists"),
    );
    if (alreadyExists) {
      const pr = await getExistingPr(owner, repo, head, base);
      return { status: "exists", pr };
    }
    throw new Error(errors[0]?.message || err.message || `HTTP 422`);
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }

  const pr = await response.json();
  return { status: "created", pr };
}

// ── Init Branch API ──────────────────────────────────────────
async function getRefSha(owner, repo, branch) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers: authHeaders() },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.object.sha;
}

async function createBranch(owner, repo, newBranch, sha) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
    },
  );
  if (response.status === 422) {
    const err = await response.json().catch(() => ({}));
    const msg = (err.message || "").toLowerCase();
    if (
      msg.includes("already exists") ||
      msg.includes("reference already exists")
    ) {
      return { status: "exists" };
    }
    throw new Error(err.message || `HTTP 422`);
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  return { status: "created" };
}

async function deleteBranch(owner, repo, branch) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );
  if (response.status === 404) {
    return { status: "not_found" };
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  return { status: "deleted" };
}
