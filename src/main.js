// Main entry point

import { fetchLedger, isAdminUnlocked, subscribeToSupabaseRealtime } from "./api.js";
import { setLedgerData, renderSummary, renderLedger, setFilter } from "./ledger.js";
import { setupModals, setupAdminActions, updateAdminUI } from "./admin.js";

export function showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

async function init() {
  setupModals();
  setupAdminActions(showToast);

  // Search input
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("btnClearSearch");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const val = searchInput.value;
      setFilter("searchQuery", val);
      if (clearBtn) clearBtn.classList.toggle("hidden", !val);
      renderLedger(isAdminUnlocked());
    });
  }

  if (clearBtn && searchInput) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      clearBtn.classList.add("hidden");
      setFilter("searchQuery", "");
      renderLedger(isAdminUnlocked());
      searchInput.focus();
    });
  }

  // Category filter
  const catFilter = document.getElementById("categoryFilter");
  if (catFilter) {
    catFilter.addEventListener("change", () => {
      setFilter("category", catFilter.value);
      renderLedger(isAdminUnlocked());
    });
  }

  // Load ledger data
  try {
    const data = await fetchLedger();
    setLedgerData(data);
    renderSummary();
    renderLedger(isAdminUnlocked());
    updateAdminUI();

    // Subscribe to Realtime Postgres updates if Supabase is active
    subscribeToSupabaseRealtime(async () => {
      try {
        const fresh = await fetchLedger();
        setLedgerData(fresh);
        renderSummary();
        renderLedger(isAdminUnlocked());
      } catch {}
    });
  } catch (err) {
    console.error("Error loading data:", err);
    renderSummary();
    renderLedger(isAdminUnlocked());
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
