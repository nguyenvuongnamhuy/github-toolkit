# GitHub Toolkit

A Chrome extension to manage GitHub Pull Requests — create PRs, bulk-approve, merge, and check status across multiple repositories.

## Features

### Tab 1 — Create PRs

- Auto-fetches all non-archived repos in the `your-org` org matching prefix `your-prefix` and suffix `your-subfix`
- Enter **From branch** and **To branch** — both support multiple comma-separated fallbacks (e.g. `dev, develop`) tried in order per repo
- Creates PRs in parallel with auto-generated title `Merge <from> into <to>`
- Per-repo status: ✅ created / ⚠️ already exists (with link) / ❌ error (links to repo's pulls page)
- **📋 Copy PRs** button copies all successful/existing PR URLs to clipboard
- Results persist after closing the popup; **🗑 Clear** button resets everything

### Tab 2 — Manage PRs

- Paste up to hundreds of PR URLs at once (one per line)
- Smart URL extraction — works even if lines have noise like `[TAG] url ✅` or `:::: url (note)`
- **🔍 Check Status** — fetches and displays each PR's current state:
  - ✅ Merged, 🟢 Open, ⚠️ Conflict, 🔴 Closed
- **✅ Approve All** — approves all PRs in parallel via GitHub API
- **🔀 Merge All** — merges all PRs using merge commit (`merge_method: merge`)
- All three actions are independent — running one does not affect the others
- Per-PR status: ⏳ pending → result icon + label / ❌ failed
- Clickable result links (`owner/repo #123`)
- URLs are saved so they persist after closing the popup

## Setup

### 1. Get a GitHub Personal Access Token

Go to [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) and create a token with the `repo` scope.

### 2. Add your token

Copy `config.example.js` to `config.js` and fill in your token:

```js
const GITHUB_TOKEN = "ghp_your_actual_token_here";
```

> `config.js` is gitignored and will never be committed.

### 3. Load the extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder

## Usage

**Create PRs:**

1. Click the extension icon (opens on **🔀 Create PRs** tab)
2. Enter From branch (e.g. `dev, develop`) and To branch (e.g. `test`)
3. Click **🔀 Create PRs**
4. Results appear below — click any row to open the PR or repo

**Manage PRs:**

1. Switch to the **📋 Manage PRs** tab
2. Paste PR URLs into the textarea (one per line)
3. Click **🔍 Check Status** to see merge/conflict state, **✅ Approve All** to approve, or **🔀 Merge All** to merge

## Project Structure

```
├── src/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/
├── manifest.json
├── config.js            # sensitive information (gitignored)
└── config.example.js
```
