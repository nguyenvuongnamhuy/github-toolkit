// ── Tab: Manage PRs ──────────────────────────────────────────
const textarea = document.getElementById("pr-textarea");
const clearBtn = document.getElementById("clear-btn");
const checkStatusBtn = document.getElementById("check-status-btn");
const approveBtn = document.getElementById("approve-btn");
const mergeBtn = document.getElementById("merge-btn");
const globalStatus = document.getElementById("global-status");
const resultList = document.getElementById("result-list");

function saveUrls() {
  chrome.storage.local.set({ [STORAGE_KEY]: textarea.value });
}

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

function createResultRow(url, icon, cls) {
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
  return row;
}

function showGlobal(msg, type) {
  globalStatus.textContent = msg;
  globalStatus.className = `global-status ${type}`;
}

function hideGlobal() {
  globalStatus.className = "global-status hidden";
  globalStatus.textContent = "";
}

function setManageBtnsDisabled(disabled) {
  checkStatusBtn.disabled = disabled;
  approveBtn.disabled = disabled;
  mergeBtn.disabled = disabled;
  clearBtn.disabled = disabled;
  textarea.disabled = disabled;
}

// Init: restore saved textarea
chrome.storage.local.get(STORAGE_KEY, (data) => {
  if (data[STORAGE_KEY]) textarea.value = data[STORAGE_KEY];
});

textarea.addEventListener("input", saveUrls);

clearBtn.addEventListener("click", () => {
  textarea.value = "";
  resultList.innerHTML = "";
  hideGlobal();
  saveUrls();
});

// ── Check Status ─────────────────────────────────────────────
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

  setManageBtnsDisabled(true);
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

  setManageBtnsDisabled(false);
});

// ── Approve All ──────────────────────────────────────────────
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

  setManageBtnsDisabled(true);
  hideGlobal();
  resultList.innerHTML = "";

  const rowEls = urls.map((url) => {
    const el = createResultRow(url, "⏳", "pending");
    resultList.appendChild(el);
    return el;
  });
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

  setManageBtnsDisabled(false);
});

// ── Merge All ────────────────────────────────────────────────
mergeBtn.addEventListener("click", async () => {
  const urls = getUrls();
  if (!urls.length) {
    showGlobal("Please enter at least one PR URL.", "error");
    return;
  }
  if (!GITHUB_TOKEN || GITHUB_TOKEN === "ghp_your_token_here") {
    showGlobal("❌ Please set your GitHub token in config.js", "error");
    return;
  }

  setManageBtnsDisabled(true);
  hideGlobal();
  resultList.innerHTML = "";

  const rowEls = urls.map((url) => {
    const el = createResultRow(url, "⏳", "pending");
    resultList.appendChild(el);
    return el;
  });
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
        await mergePr(parsed.owner, parsed.repo, parsed.pull_number);
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
    showGlobal(`✅ All ${urls.length} PR(s) merged!`, "success");
  } else if (failed === urls.length) {
    showGlobal(`❌ All ${urls.length} PR(s) failed to merge.`, "error");
  } else {
    showGlobal(`⚠️ ${urls.length - failed} merged, ${failed} failed.`, "error");
  }

  setManageBtnsDisabled(false);
});
