// ── Tab: Create PRs ──────────────────────────────────────────
const fromBranchInput = document.getElementById("from-branch");
const toBranchInput = document.getElementById("to-branch");
const createBtn = document.getElementById("create-btn");
const createClearBtn = document.getElementById("create-clear-btn");
const copyPrsBtn = document.getElementById("copy-prs-btn");
const createStatus = document.getElementById("create-status");
const createResultList = document.getElementById("create-result-list");

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

// Init: restore Tab state
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

  // Persist state
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
