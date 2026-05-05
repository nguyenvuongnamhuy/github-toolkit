const STORAGE_KEY = "pr_urls";
const STORAGE_KEY_CREATE = "create_prs_state";

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
