// ── Tab: Init Branch ──────────────────────────────────────────
const initBaseBranchInput = document.getElementById("init-base-branch");
const initNewBranchInput = document.getElementById("init-new-branch");
const initSearchInput = document.getElementById("init-search");
const initRepoListEl = document.getElementById("init-repo-list");
const initBtn = document.getElementById("init-btn");
const deleteBranchBtn = document.getElementById("delete-branch-btn");
const initStatus = document.getElementById("init-status");
const initResultList = document.getElementById("init-result-list");

let allInitRepos = [];
const checkedRepos = new Set(); // tracks checked repo names across re-renders

function showInitStatus(msg, type) {
  initStatus.textContent = msg;
  initStatus.className = `global-status ${type}`;
}

function hideInitStatus() {
  initStatus.className = "global-status hidden";
  initStatus.textContent = "";
}

function renderRepoList(filter) {
  const lower = (filter || "").toLowerCase();
  initRepoListEl.innerHTML = "";

  const filtered = allInitRepos.filter((r) =>
    r.name.toLowerCase().includes(lower),
  );

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "init-repo-empty";
    empty.textContent = filter
      ? "No repos match your search."
      : "No repos found.";
    initRepoListEl.appendChild(empty);
    return;
  }

  filtered.forEach((repo) => {
    const label = document.createElement("label");
    label.className = "repo-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = repo.name;
    cb.dataset.owner = repo.owner.login;
    cb.checked = checkedRepos.has(repo.name);
    cb.addEventListener("change", () => {
      if (cb.checked) checkedRepos.add(repo.name);
      else checkedRepos.delete(repo.name);
    });

    const nameEl = document.createElement("span");
    nameEl.textContent = repo.name;

    label.appendChild(cb);
    label.appendChild(nameEl);
    initRepoListEl.appendChild(label);
  });
}

function getSelectedRepos() {
  return allInitRepos
    .filter((r) => checkedRepos.has(r.name))
    .map((r) => ({ owner: r.owner.login, repo: r.name }));
}

function setControlsDisabled(disabled) {
  initBtn.disabled = disabled;
  deleteBranchBtn.disabled = disabled;
  initSearchInput.disabled = disabled;
  initBaseBranchInput.disabled = disabled;
  initNewBranchInput.disabled = disabled;
  initRepoListEl
    .querySelectorAll("input[type=checkbox]")
    .forEach((cb) => (cb.disabled = disabled));
}

async function loadRepos() {
  checkedRepos.clear();
  initResultList.innerHTML = "";
  hideInitStatus();
  showInitStatus("Loading repos...", "info");
  initRepoListEl.innerHTML = "";
  try {
    allInitRepos = await fetchFilteredRepos();
    hideInitStatus();
    renderRepoList();
  } catch (err) {
    showInitStatus(`Failed to load repos: ${err.message}`, "error");
  }
}

function addInitResultRow(repoName, icon, cls, message) {
  const row = document.createElement("div");
  row.className = `result-row ${cls}`;

  const iconEl = document.createElement("span");
  iconEl.className = "result-icon";
  iconEl.textContent = icon;

  const nameEl = document.createElement("span");
  nameEl.className = "result-url";
  nameEl.textContent = repoName;

  const msgEl = document.createElement("span");
  msgEl.className = "result-label";
  msgEl.textContent = message;

  row.appendChild(iconEl);
  row.appendChild(nameEl);
  row.appendChild(msgEl);
  initResultList.appendChild(row);
}

// ── Search filter ────────────────────────────────────────────
initSearchInput.addEventListener("input", () => {
  renderRepoList(initSearchInput.value);
});

// ── Init button ──────────────────────────────────────────────
initBtn.addEventListener("click", async () => {
  const newBranch = initNewBranchInput.value.trim();
  if (!newBranch) {
    showInitStatus("Please enter a new branch name.", "error");
    return;
  }

  const selected = getSelectedRepos();
  if (selected.length === 0) {
    showInitStatus("Please select at least one repo.", "error");
    return;
  }

  const baseBranches = initBaseBranchInput.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  initResultList.innerHTML = "";
  hideInitStatus();
  setControlsDisabled(true);
  showInitStatus(`Creating branch on ${selected.length} repo(s)...`, "info");

  const results = await Promise.allSettled(
    selected.map(async ({ owner, repo }) => {
      let baseBranch = null;
      for (const b of baseBranches) {
        if (await branchExists(owner, repo, b)) {
          baseBranch = b;
          break;
        }
      }
      if (!baseBranch) {
        throw new Error(`Base branch not found: ${baseBranches.join(", ")}`);
      }
      const sha = await getRefSha(owner, repo, baseBranch);
      return createBranch(owner, repo, newBranch, sha);
    }),
  );

  let created = 0,
    existed = 0,
    failed = 0;
  results.forEach((result, i) => {
    const { repo } = selected[i];
    if (result.status === "fulfilled") {
      if (result.value.status === "exists") {
        addInitResultRow(repo, "⚠️", "warn", "Already exists");
        existed++;
      } else {
        addInitResultRow(repo, "✅", "ok", `Branch "${newBranch}" created`);
        created++;
      }
    } else {
      addInitResultRow(repo, "❌", "fail", result.reason.message);
      failed++;
    }
  });

  const parts = [];
  if (created) parts.push(`✅ ${created} created`);
  if (existed) parts.push(`⚠️ ${existed} already existed`);
  if (failed) parts.push(`❌ ${failed} failed`);
  showInitStatus(
    parts.join(", "),
    failed > 0 ? "error" : existed > 0 ? "info" : "success",
  );

  setControlsDisabled(false);
});

// ── Delete button ────────────────────────────────────────────
deleteBranchBtn.addEventListener("click", async () => {
  const newBranch = initNewBranchInput.value.trim();
  if (!newBranch) {
    showInitStatus("Please enter a branch name to delete.", "error");
    return;
  }

  const selected = getSelectedRepos();
  if (selected.length === 0) {
    showInitStatus("Please select at least one repo.", "error");
    return;
  }

  const confirmed = confirm(
    `Delete branch '${newBranch}' on ${selected.length} repo(s)? This cannot be undone.`,
  );
  if (!confirmed) return;

  initResultList.innerHTML = "";
  hideInitStatus();
  setControlsDisabled(true);
  showInitStatus(`Deleting branch on ${selected.length} repo(s)...`, "info");

  const results = await Promise.allSettled(
    selected.map(({ owner, repo }) => deleteBranch(owner, repo, newBranch)),
  );

  let deleted = 0,
    notFound = 0,
    failed = 0;
  results.forEach((result, i) => {
    const { repo } = selected[i];
    if (result.status === "fulfilled") {
      if (result.value.status === "not_found") {
        addInitResultRow(repo, "⚠️", "warn", "Branch not found");
        notFound++;
      } else {
        addInitResultRow(repo, "✅", "ok", `Branch "${newBranch}" deleted`);
        deleted++;
      }
    } else {
      addInitResultRow(repo, "❌", "fail", result.reason.message);
      failed++;
    }
  });

  const parts = [];
  if (deleted) parts.push(`✅ ${deleted} deleted`);
  if (notFound) parts.push(`⚠️ ${notFound} not found`);
  if (failed) parts.push(`❌ ${failed} failed`);
  showInitStatus(
    parts.join(", "),
    failed > 0 ? "error" : notFound > 0 ? "info" : "success",
  );

  setControlsDisabled(false);
});

// Load repos every time popup becomes visible (handles Chrome keeping popup alive)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    loadRepos();
  }
});

// Initial load
loadRepos();
