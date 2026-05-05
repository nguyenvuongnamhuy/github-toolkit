// GitHub Personal Access Token - EXAMPLE FILE
// Copy this file to config.js and fill in your token
// Requires scope: `repo` (for private repos) or `public_repo` (for public repos)
const GITHUB_TOKEN = "ghp_your_token_here";

// GitHub org to scan for repositories (Tab 2 — Create PRs)
const ORG = "your-org-name"; // your org name here

// Only repos matching at least one prefix AND one suffix will be included
const REPO_PREFIXES = ["your-prefix-"]; // your prefixes here
const REPO_SUFFIXES = ["-service"]; // your suffixes here
