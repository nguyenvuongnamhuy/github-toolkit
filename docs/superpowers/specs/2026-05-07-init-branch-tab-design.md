# Init Branch Tab — Design Spec

**Date:** 2026-05-07  
**Status:** Approved

## Overview

Add a new "Init Branch" tab as the first tab in the GitHub Toolkit popup. Users can load all matching repos, select a subset, enter a branch name, then either create (Init) or delete that branch across all selected repos on remote.

---

## Tab Order

1. 🌿 **Init Branch** ← new, default active
2. 🔀 Create PRs
3. 📋 Manage PRs

---

## UI Layout

```
┌─────────────────────────────────────┐
│ Base branch:  [dev, develop______]  │
│ New branch:   [__________________]  │
│                                     │
│ Search repos: [__________________]  │
│ ┌────────────────────────────────┐  │
│ │ ☑  service-abc-api            │  │
│ │ ☑  service-xyz-worker         │  │
│ │ ☐  service-foo-backend        │  │
│ │ ...  (scrollable)             │  │
│ └────────────────────────────────┘  │
│                                     │
│  [🌿 Init]        [🗑 Delete]       │
│                                     │
│ ── global status bar ───────────── │
│ ── result list ─────────────────── │
└─────────────────────────────────────┘
```

- **Base branch** input: default value `dev, develop` (comma-separated fallback list, same pattern as Create PRs)
- **New branch** input: name of branch to create/delete
- **Search repos** input: filters the checkbox list in realtime by repo name
- **Repo list**: scrollable checkbox list, auto-loaded when tab first becomes active
- **No "Select All"** checkbox

---

## Behavior

### Loading Repos

- Triggered automatically the first time the "Init Branch" tab is activated
- Calls existing `fetchFilteredRepos()` from `github-api.js` — no changes needed
- Shows a loading message in the status bar while fetching
- Repos cached in a module-level variable in `init-branch.js`; not re-fetched when switching back to the tab
- All repos start unchecked after load

### Search / Filter

- Typing in the Search input filters the visible repo checkboxes by `repo.name` (case-insensitive, substring match)
- Filtering is purely visual — checked state of hidden repos is preserved

### Init (Create Branch)

For each selected repo, in parallel (`Promise.allSettled`):

1. Parse base branch input by comma → trim each → try each with `branchExists()` in order → use first that exists
2. If no base branch exists in this repo → result row ❌ "Base branch not found: dev, develop"
3. `GET /repos/{owner}/{repo}/git/ref/heads/{baseBranch}` → extract `object.sha`
4. `POST /repos/{owner}/{repo}/git/refs` with body `{ ref: "refs/heads/{newBranch}", sha }`
5. Success → ✅ row: "`service-abc-api` — branch `feature/xyz` created"
6. 422 with "already exists" → ⚠️ row: "`service-abc-api` — Already exists"
7. Other error → ❌ row with error message

Summary after all complete: `"✅ X created, ⚠️ Y already existed, ❌ Z failed."`

### Delete Branch

- Show `confirm()` dialog: `"Delete branch '{name}' on {N} repo(s)? This cannot be undone."`
- If cancelled → do nothing

For each selected repo, in parallel (`Promise.allSettled`):

1. `DELETE /repos/{owner}/{repo}/git/refs/heads/{newBranch}`
2. Success → ✅ row: "`service-abc-api` — branch `feature/xyz` deleted"
3. 404 → ⚠️ row: "`service-abc-api` — Branch not found"
4. Other error → ❌ row with error message

Summary after all complete: `"✅ X deleted, ⚠️ Y not found, ❌ Z failed."`

### Validation (before any API call)

- New branch input empty → show inline error in status bar, abort
- No repos selected → show inline error in status bar, abort

### Button States

- While running: disable both Init and Delete buttons + disable search input + disable all checkboxes
- After completion: re-enable all

---

## API Functions (additions to `github-api.js`)

```js
// Get the SHA of a branch ref
async function getRefSha(owner, repo, branch) { ... }
// POST to create a new branch from a SHA
async function createBranch(owner, repo, newBranch, sha) { ... }
// DELETE a branch ref
async function deleteBranch(owner, repo, branch) { ... }
```

`branchExists()` and `fetchFilteredRepos()` are reused as-is.

---

## Files Changed

| File | Change |
|---|---|
| `src/popup.html` | Add tab button `data-tab="init"` (first position); add `#tab-init` panel |
| `src/popup.js` | Update tab switching to include `init` tab; set `init` as default active |
| `src/github-api.js` | Add `getRefSha()`, `createBranch()`, `deleteBranch()` |
| `src/init-branch.js` | New file — all Init Branch tab logic |
| `src/popup.html` | Add `<script src="init-branch.js">` after `github-api.js` |

---

## State Persistence

- **Not persisted** to `chrome.storage` — repo list and selections reset each time popup is opened
- Repo list cached in memory for the lifetime of the popup session

---

## Out of Scope

- No "Select All" checkbox
- No branch protection checks before delete
- No dry-run mode
