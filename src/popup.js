const STORAGE_KEY = "pr_urls";
const STORAGE_KEY_CREATE = "create_prs_state";
// ORG, REPO_PREFIXES, REPO_SUFFIXES are loaded from config.js

// Tab 1 elements
const textarea = document.getElementById("pr-textarea");
const clearBtn = document.getElementById("clear-btn");
const checkStatusBtn = document.getElementById("check-status-btn");
const approveBtn = document.getElementById("approve-btn");
const globalStatus = document.getElementById("global-status");
const resultList = document.getElementById("result-list");

// Tab 2 elements
const fromBranchInput = document.getElementById("from-branch");
const toBranchInput = document.getElementById("to-branch");
const createBtn = document.getElementById("create-btn");
const createClearBtn = document.getElementById("create-clear-btn");
const copyPrsBtn = document.getElementById("copy-prs-btn");
const createStatus = document.getElementById("create-status");
const createResultList = document.getElementById("create-result-list");

// ── Tab switching ────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.add("hidden"));
    btn.classList.add("active");
    document
      .getElementById(`tab-${btn.dataset.tab}`)
      .classList.remove("hidden");
  });
});

// ── Shared GitHub API helpers ────────────────────────────────
function authHeaders() {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

// ── Tab 1: Bulk Approve ──────────────────────────────────────
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

// Approve a single PR via GitHub API
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

// Fetch PR status from GitHub API
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

// Save textarea content to storage
function saveUrls() {
  chrome.storage.local.set({ [STORAGE_KEY]: textarea.value });
}

// Get valid URLs from textarea (one per line, extract GitHub PR URL, skip blanks)
function getUrls() {
  return textarea.value
    .split(/\n/)
    .map((l) => {
      const match = l.match(
        /https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/,
      );
      return match ? match[0] : null;
    })
    .filter(Boolean);
}

// Build result row element
function createResultRow(url, icon, cls, errMsg = "") {
  const row = document.createElement("div");
  row.className = `result-row ${cls}`;

  const iconEl = document.createElement("span");
  iconEl.className = "result-icon";
  iconEl.textContent = icon;

  const urlEl = document.createElement("a");
  urlEl.className = "result-url";
  const parsed = parsePrUrl(url);
  urlEl.textContent = parsed
    ? `${parsed.owner}/${parsed.repo} #${parsed.pull_number}`
    : url;
  urlEl.title = url;
  urlEl.href = url;
  urlEl.target = "_blank";
  urlEl.rel = "noopener noreferrer";

  row.appendChild(iconEl);
  row.appendChild(urlEl);

  if (errMsg) {
    const err = document.createElement("span");
    err.className = "result-err";
    err.textContent = errMsg;
    err.title = errMsg;
    row.appendChild(err);
  }

  return row;
}

// Init: restore saved textarea
chrome.storage.local.get(STORAGE_KEY, (data) => {
  if (data[STORAGE_KEY]) textarea.value = data[STORAGE_KEY];
});

// Init: restore Tab 2 state
chrome.storage.local.get(STORAGE_KEY_CREATE, (data) => {
  const saved = data[STORAGE_KEY_CREATE];
  if (!saved) return;
  if (saved.fromBranch) fromBranchInput.value = saved.fromBranch;
  if (saved.toBranch) toBranchInput.value = saved.toBranch;
  if (saved.statusMsg)
    showCreateStatus(saved.statusMsg, saved.statusType || "info");
  if (saved.rows && saved.rows.length) {
    const prUrls = [];
    saved.rows.forEach(({ repoName, icon, cls, href, errMsg }) => {
      const el = createPrRow(repoName, icon, cls);
      const link = el.querySelector(".result-url");
      if (href) {
        link.href = href;
        link.textContent = repoName;
      }
      if (errMsg) {
        const errEl = document.createElement("span");
        errEl.className = "result-err";
        errEl.textContent = errMsg;
        errEl.title = errMsg;
        el.appendChild(errEl);
      }
      createResultList.appendChild(el);
      if (cls === "ok" || cls === "warn") prUrls.push(href);
    });
    if (prUrls.filter(Boolean).length) {
      copyPrsBtn.classList.remove("hidden");
      copyPrsBtn.onclick = async () => {
        await navigator.clipboard.writeText(prUrls.filter(Boolean).join("\n"));
        copyPrsBtn.textContent = "✅ Copied!";
        setTimeout(() => {
          copyPrsBtn.textContent = "📋 Copy PRs";
        }, 2000);
      };
    }
  }
});

textarea.addEventListener("input", saveUrls);

clearBtn.addEventListener("click", () => {
  textarea.value = "";
  resultList.innerHTML = "";
  hideGlobal();
  saveUrls();
});

checkStatusBtn.addEventListener("click", async () => {
  const urls = getUrls();

  if (!urls.length) {
    showGlobal("Please enter at least one PR URL.", "error");
    return;
  }

  if (!GITHUB_TOKEN || GITHUB_TOKEN === "ghp_your_token_here") {
    showGlobal("❌ Please set your GitHub token in config.js", "error");
    return;
  }

  checkStatusBtn.disabled = true;
  approveBtn.disabled = true;
  clearBtn.disabled = true;
  textarea.disabled = true;
  hideGlobal();

  resultList.innerHTML = "";
  const rowEls = urls.map((url) => {
    const el = createResultRow(url, "⏳", "pending");
    resultList.appendChild(el);
    return el;
  });

  resultList.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const counts = { merged: 0, closed: 0, conflict: 0, open: 0, failed: 0 };

  await Promise.allSettled(
    urls.map(async (url, i) => {
      const parsed = parsePrUrl(url);
      if (!parsed) {
        rowEls[i].className = "result-row fail";
        rowEls[i].querySelector(".result-icon").textContent = "❌";
        const err = document.createElement("span");
        err.className = "result-err";
        err.textContent = "Invalid URL";
        rowEls[i].appendChild(err);
        counts.failed++;
        return;
      }
      try {
        const pr = await getPrStatus(
          parsed.owner,
          parsed.repo,
          parsed.pull_number,
        );
        let icon, cls, label;
        if (pr.merged) {
          icon = "✅";
          cls = "ok";
          label = "Merged";
          counts.merged++;
        } else if (pr.state === "closed") {
          icon = "🔴";
          cls = "fail";
          label = "Closed";
          counts.closed++;
        } else if (pr.mergeable_state === "dirty") {
          icon = "⚠️";
          cls = "warn";
          label = "Conflict";
          counts.conflict++;
        } else {
          icon = "🟢";
          cls = "ok";
          label = "Open";
          counts.open++;
        }
        rowEls[i].className = `result-row ${cls}`;
        rowEls[i].querySelector(".result-icon").textContent = icon;
        const labelEl = document.createElement("span");
        labelEl.className = "result-label";
        labelEl.textContent = label;
        rowEls[i].appendChild(labelEl);
      } catch (err) {
        rowEls[i].className = "result-row fail";
        rowEls[i].querySelector(".result-icon").textContent = "❌";
        const errEl = document.createElement("span");
        errEl.className = "result-err";
        errEl.textContent = err.message;
        errEl.title = err.message;
        rowEls[i].appendChild(errEl);
        counts.failed++;
      }
    }),
  );

  const parts = [];
  if (counts.merged) parts.push(`${counts.merged} merged`);
  if (counts.open) parts.push(`${counts.open} open`);
  if (counts.conflict) parts.push(`${counts.conflict} conflict`);
  if (counts.closed) parts.push(`${counts.closed} closed`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  showGlobal(
    `Checked ${urls.length} PR(s): ${parts.join(", ")}.`,
    counts.failed ? "error" : "success",
  );

  checkStatusBtn.disabled = false;
  approveBtn.disabled = false;
  clearBtn.disabled = false;
  textarea.disabled = false;
});

approveBtn.addEventListener("click", async () => {
  const urls = getUrls();

  if (!urls.length) {
    showGlobal("Please enter at least one PR URL.", "error");
    return;
  }

  if (!GITHUB_TOKEN || GITHUB_TOKEN === "ghp_your_token_here") {
    showGlobal("❌ Please set your GitHub token in config.js", "error");
    return;
  }

  approveBtn.disabled = true;
  clearBtn.disabled = true;
  textarea.disabled = true;
  hideGlobal();

  // Render pending rows
  resultList.innerHTML = "";
  const rowEls = urls.map((url) => {
    const el = createResultRow(url, "⏳", "pending");
    resultList.appendChild(el);
    return el;
  });

  // Scroll result list into view
  resultList.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const results = await Promise.allSettled(
    urls.map(async (url, i) => {
      const parsed = parsePrUrl(url);
      if (!parsed) {
        rowEls[i].className = "result-row fail";
        rowEls[i].querySelector(".result-icon").textContent = "❌";
        const err = document.createElement("span");
        err.className = "result-err";
        err.textContent = "Invalid URL";
        rowEls[i].appendChild(err);
        throw new Error("Invalid URL");
      }
      try {
        await approvePr(parsed.owner, parsed.repo, parsed.pull_number);
        rowEls[i].className = "result-row ok";
        rowEls[i].querySelector(".result-icon").textContent = "✅";
      } catch (err) {
        rowEls[i].className = "result-row fail";
        rowEls[i].querySelector(".result-icon").textContent = "❌";
        const errEl = document.createElement("span");
        errEl.className = "result-err";
        errEl.textContent = err.message;
        errEl.title = err.message;
        rowEls[i].appendChild(errEl);
        throw err;
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed === 0) {
    showGlobal(`✅ All ${urls.length} PR(s) approved!`, "success");
  } else if (failed === urls.length) {
    showGlobal(
      `❌ All ${urls.length} PR(s) failed. Check URLs & token.`,
      "error",
    );
  } else {
    showGlobal(
      `⚠️ ${urls.length - failed} approved, ${failed} failed.`,
      "error",
    );
  }

  approveBtn.disabled = false;
  clearBtn.disabled = false;
  textarea.disabled = false;
});

function showGlobal(msg, type) {
  globalStatus.textContent = msg;
  globalStatus.className = `global-status ${type}`;
}

function hideGlobal() {
  globalStatus.className = "global-status hidden";
  globalStatus.textContent = "";
}

// ── Tab 2: Create PRs ────────────────────────────────────────

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

function createPrRow(repoName, icon, cls) {
  const row = document.createElement("div");
  row.className = `result-row ${cls}`;

  const iconEl = document.createElement("span");
  iconEl.className = "result-icon";
  iconEl.textContent = icon;

  const urlEl = document.createElement("a");
  urlEl.className = "result-url";
  urlEl.textContent = repoName;
  urlEl.target = "_blank";
  urlEl.rel = "noopener noreferrer";

  row.appendChild(iconEl);
  row.appendChild(urlEl);

  return row;
}

function showCreateStatus(msg, type) {
  createStatus.textContent = msg;
  createStatus.className = `global-status ${type}`;
}

function hideCreateStatus() {
  createStatus.className = "global-status hidden";
  createStatus.textContent = "";
}

createClearBtn.addEventListener("click", () => {
  fromBranchInput.value = "";
  toBranchInput.value = "";
  createResultList.innerHTML = "";
  hideCreateStatus();
  copyPrsBtn.classList.add("hidden");
  chrome.storage.local.remove(STORAGE_KEY_CREATE);
});

createBtn.addEventListener("click", async () => {
  const fromBranches = fromBranchInput.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const toBranches = toBranchInput.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!fromBranches.length || !toBranches.length) {
    showCreateStatus("Please enter both branch names.", "error");
    return;
  }

  if (!GITHUB_TOKEN || GITHUB_TOKEN === "ghp_your_token_here") {
    showCreateStatus("❌ Please set your GitHub token in config.js", "error");
    return;
  }

  createBtn.disabled = true;
  copyPrsBtn.classList.add("hidden");
  createResultList.innerHTML = "";
  showCreateStatus("⏳ Fetching repositories...", "info");

  let repos;
  try {
    repos = await fetchFilteredRepos();
  } catch (err) {
    showCreateStatus(`❌ Failed to fetch repos: ${err.message}`, "error");
    createBtn.disabled = false;
    return;
  }

  if (!repos.length) {
    showCreateStatus("No matching repositories found.", "error");
    createBtn.disabled = false;
    return;
  }

  showCreateStatus(`⏳ Creating PRs for ${repos.length} repo(s)...`, "info");

  const rowEls = repos.map((repo) => {
    const el = createPrRow(repo.name, "⏳", "pending");
    createResultList.appendChild(el);
    return { el, repo };
  });

  createResultList.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const results = await Promise.allSettled(
    rowEls.map(async ({ el, repo }) => {
      try {
        const result = await createPrWithFallback(
          repo.owner.login,
          repo.name,
          fromBranches,
          toBranches,
        );
        const link = el.querySelector(".result-url");
        if (result.status === "exists") {
          el.className = "result-row warn";
          el.querySelector(".result-icon").textContent = "⚠️";
          if (result.pr) {
            link.href = result.pr.html_url;
            link.textContent = `${repo.name} #${result.pr.number}`;
          }
        } else {
          el.className = "result-row ok";
          el.querySelector(".result-icon").textContent = "✅";
          if (result.pr) {
            link.href = result.pr.html_url;
            link.textContent = `${repo.name} #${result.pr.number}`;
          }
        }
      } catch (err) {
        el.className = "result-row fail";
        el.querySelector(".result-icon").textContent = "❌";
        const link = el.querySelector(".result-url");
        link.href = `https://github.com/${repo.owner.login}/${repo.name}/pulls`;
        const errEl = document.createElement("span");
        errEl.className = "result-err";
        errEl.textContent = err.message;
        errEl.title = err.message;
        el.appendChild(errEl);
        throw err;
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  const warned = rowEls.filter(({ el }) =>
    el.classList.contains("warn"),
  ).length;
  const succeeded = repos.length - failed - warned;

  if (failed === 0 && warned === 0) {
    showCreateStatus(`✅ All ${repos.length} PR(s) created!`, "success");
  } else {
    showCreateStatus(
      `✅ ${succeeded} created · ⚠️ ${warned} existing · ❌ ${failed} failed`,
      failed > 0 ? "error" : "info",
    );
  }

  // Collect URLs from successful/existing rows
  const prUrls = rowEls
    .filter(
      ({ el }) => el.classList.contains("ok") || el.classList.contains("warn"),
    )
    .map(({ el }) => el.querySelector(".result-url")?.href)
    .filter(Boolean);

  if (prUrls.length) {
    copyPrsBtn.classList.remove("hidden");
    copyPrsBtn.onclick = async () => {
      await navigator.clipboard.writeText(prUrls.join("\n"));
      copyPrsBtn.textContent = "✅ Copied!";
      setTimeout(() => {
        copyPrsBtn.textContent = "📋 Copy PRs";
      }, 2000);
    };
  }

  // Persist Tab 2 state
  const serializedRows = rowEls.map(({ el, repo }) => {
    const cls =
      [...el.classList].find((c) =>
        ["ok", "warn", "fail", "pending"].includes(c),
      ) || "pending";
    const icon = el.querySelector(".result-icon")?.textContent || "";
    const link = el.querySelector(".result-url");
    const href = link?.href || "";
    const repoName = link?.textContent || repo.name;
    const errEl = el.querySelector(".result-err");
    const errMsg = errEl?.textContent || "";
    return { repoName, icon, cls, href, errMsg };
  });
  chrome.storage.local.set({
    [STORAGE_KEY_CREATE]: {
      fromBranch: fromBranchInput.value,
      toBranch: toBranchInput.value,
      statusMsg: createStatus.textContent,
      statusType:
        [...createStatus.classList].find((c) =>
          ["success", "error", "info"].includes(c),
        ) || "info",
      rows: serializedRows,
    },
  });

  createBtn.disabled = false;
});
