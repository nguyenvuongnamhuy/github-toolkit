# GitHub Toolkit — Copilot Instructions

## Project Overview

A Chrome extension (Manifest V3) to manage GitHub Pull Requests: bulk-approve PRs and auto-create PRs across org repos. Two-tab popup UI.

## Structure

```
├── src/
│   ├── popup.html       # Extension popup UI (tab bar + 2 tab panels)
│   ├── popup.css        # Light theme styles (GitHub-style)
│   └── popup.js         # All popup logic — tab switching, API calls, rendering
├── icons/               # icon16.png, icon48.png, icon128.png
├── manifest.json        # MV3 manifest — name: "GitHub Toolkit"
├── config.js            # GITHUB_TOKEN, ORG, REPO_PREFIXES, REPO_SUFFIXES (gitignored, never commit)
└── config.example.js    # Token + config template for onboarding
```

## Key Conventions

- **No build step** — plain HTML/CSS/JS, loaded directly by Chrome
- **`config.js`** is gitignored; exports globals `GITHUB_TOKEN`, `ORG`, `REPO_PREFIXES`, `REPO_SUFFIXES` loaded before `popup.js` in the HTML
- **Tab switching** — `.tab-btn[data-tab]` toggles `.hidden` on `.tab-panel` elements
- **`chrome.storage.local`** — Tab 1 persists textarea URLs under `pr_urls`; Tab 2 persists full results state under `create_prs_state`
- All API calls use `authHeaders()` shared helper returning `Authorization: token <PAT>` headers
- Results are rendered as `<a>` tags; `Promise.allSettled` is used throughout so failures never block other items

## Tab 1 — Bulk Approve + Check Status

Two independent action buttons share the same textarea, result list, and global status bar:

**Check Status (`🔍 Check Status`)**

- **API**: `GET /repos/{owner}/{repo}/pulls/{pull_number}` via `getPrStatus()`
- Status mapping from response: `merged: true` → ✅ Merged; `state: "closed"` → 🔴 Closed; `mergeable_state: "dirty"` → ⚠️ Conflict; otherwise → 🟢 Open
- Result row appends a `.result-label` span (not `.result-err`) with the status text
- `.result-row.warn` (yellow left border) used for Conflict rows
- Summary: `"Checked N PR(s): X merged, Y open, Z conflict, W closed"`

**Approve All (`✅ Approve All`)**

- **API**: `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` with `{ "event": "APPROVE" }`
- `getUrls()` extracts GitHub PR URLs from each textarea line (noise-tolerant regex)
- Results show `owner/repo #number` as clickable links

Both buttons disable textarea + both action buttons while running, then re-enable on completion.

## Tab 2 — Create PRs

- **Org + filter config** loaded from `config.js`: `ORG`, `REPO_PREFIXES`, `REPO_SUFFIXES`
- `fetchFilteredRepos()` — paginates `GET /orgs/{org}/repos`, filters by prefix + suffix + `archived: false`
- **From/To branch inputs** accept comma-separated fallback names (e.g. `dev, develop`); `branchExists()` checks each per repo in order
- `createPrWithFallback()` resolves the first existing from/to branch per repo then calls `createPr()`
- `createPr()` — `POST /repos/{owner}/{repo}/pulls`; on `422` checks `errors[0].message` for "already exists" → calls `getExistingPr()` and returns `{ status: "exists", pr }`
- Error rows link to `/{owner}/{repo}/pulls`; ⚠️ and ✅ rows link to the specific PR
- **📋 Copy PRs** button appears after run; copies all ✅/⚠️ PR URLs to clipboard
- **🗑 Clear** resets inputs, results, and removes `create_prs_state` from storage
- Full results state is serialized to `chrome.storage.local` after each run and restored on popup open

## Do Not

- Do not add a build system unless explicitly asked
- Do not store the token in `chrome.storage` or anywhere other than `config.js`
- Do not commit `config.js`
- Do not add content scripts unless asked
