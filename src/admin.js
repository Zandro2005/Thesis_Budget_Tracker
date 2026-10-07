// Direct admin mode and CRUD handling

import {
  authenticateAdmin,
  addExpense,
  updateExpense,
  deleteExpense,
  isAdminUnlocked,
  clearAdminPassword,
  fetchLedger,
  isSupabaseConfigured,
  getSupabaseConfig,
  setSupabaseConfig,
  testSupabaseConnection
} from "./api.js";

import {
  getLedgerData,
  setLedgerData,
  renderSummary,
  renderLedger,
  formatPeso
} from "./ledger.js";

let deleteTargetId = null;

export function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove("hidden");
    const input = el.querySelector("input, select");
    if (input) setTimeout(() => input.focus(), 50);
  }
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add("hidden");
    if (id === "modalExpense") {
      const idInput = document.getElementById("expenseIdInput");
      if (idInput) idInput.value = "";
      const form = document.getElementById("formExpense");
      if (form) form.reset();
    }
    if (id === "modalDelete") {
      deleteTargetId = null;
    }
    if (id === "modalDatabase") {
      const urlInput = document.getElementById("supabaseUrlInput");
      const keyInput = document.getElementById("supabaseKeyInput");
      if (urlInput) urlInput.value = "";
      if (keyInput) keyInput.value = "";
    }
  }
}

export function setupModals() {
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close")));
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-backdrop:not(.hidden)").forEach((m) => closeModal(m.id));
    }
  });

  // Auto-scroll input into center view on focus (prevents mobile keyboard from covering field)
  document.querySelectorAll(".form-input, select, textarea").forEach((field) => {
    field.addEventListener("focus", () => {
      setTimeout(() => {
        field.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    });
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA")) {
        active.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }
}

export function updateDatabaseUI() {
  const isConfigured = isSupabaseConfigured();
  const dbIndicator = document.getElementById("dbIndicator");
  const stickyDbIndicator = document.getElementById("stickyDbIndicator");
  const dbBtnLabel = document.getElementById("dbBtnLabel");
  const dbStatusDot = document.getElementById("dbStatusDot");
  const dbStatusText = document.getElementById("dbStatusText");
  const btnDisconnect = document.getElementById("btnDisconnectDb");

  if (dbIndicator) {
    dbIndicator.className = isConfigured ? "db-indicator connected" : "db-indicator warning";
  }
  if (stickyDbIndicator) {
    stickyDbIndicator.className = isConfigured ? "db-indicator connected" : "db-indicator warning";
  }
  if (dbBtnLabel) {
    dbBtnLabel.textContent = isConfigured ? "PostgreSQL" : "Database";
  }
  if (dbStatusDot) {
    dbStatusDot.className = isConfigured ? "db-status-dot connected" : "db-status-dot";
  }
  if (dbStatusText) {
    dbStatusText.textContent = isConfigured
      ? "Connected to Supabase PostgreSQL Database"
      : "Using Local & Server Storage (Supabase not connected)";
  }
  if (btnDisconnect) {
    btnDisconnect.style.display = isConfigured ? "inline-block" : "none";
  }
}

export function updateAdminUI() {
  const isUnlocked = isAdminUnlocked();
  const adminBtn = document.getElementById("btnAdminAuth");
  const adminLabel = document.getElementById("adminBtnLabel");
  const stickyAdminBtn = document.getElementById("stickyAdminBtn");

  if (adminBtn && adminLabel) {
    if (isUnlocked) {
      adminBtn.classList.add("unlocked");
      adminLabel.textContent = "Lock";
    } else {
      adminBtn.classList.remove("unlocked");
      adminLabel.textContent = "Admin";
    }
  }

  if (stickyAdminBtn) {
    stickyAdminBtn.textContent = isUnlocked ? "Lock" : "Admin";
  }

  // Database settings button is strictly admin-only
  const dbBtn = document.getElementById("btnOpenDbModal");
  const stickyDbBtn = document.getElementById("stickyDbBtn");
  if (dbBtn) dbBtn.classList.toggle("hidden", !isUnlocked);
  if (stickyDbBtn) stickyDbBtn.classList.toggle("hidden", !isUnlocked);

  renderLedger(isUnlocked);
  updateDatabaseUI();
}

export function setupAdminActions(showToast) {
  // Database Modal openers - strictly protected behind admin mode
  const openDbModal = () => {
    if (!isAdminUnlocked()) {
      showToast("Unlock admin to manage database settings.");
      openModal("modalAdminAuth");
      return;
    }

    const { url, key } = getSupabaseConfig();
    const urlInput = document.getElementById("supabaseUrlInput");
    const keyInput = document.getElementById("supabaseKeyInput");

    if (urlInput) urlInput.value = url || "";
    if (keyInput) {
      keyInput.value = key ? "••••••••••••••••••••••••••••••••" : "";
      keyInput.setAttribute("data-has-existing", key ? "true" : "false");
    }

    updateDatabaseUI();
    openModal("modalDatabase");
  };

  const dbBtn = document.getElementById("btnOpenDbModal");
  if (dbBtn) dbBtn.addEventListener("click", openDbModal);

  const stickyDbBtn = document.getElementById("stickyDbBtn");
  if (stickyDbBtn) stickyDbBtn.addEventListener("click", openDbModal);

  // Database Form Submit (Test & Save)
  const dbForm = document.getElementById("formDatabase");
  if (dbForm) {
    dbForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = (document.getElementById("supabaseUrlInput").value || "").trim();
      let key = (document.getElementById("supabaseKeyInput").value || "").trim();
      const keyInput = document.getElementById("supabaseKeyInput");
      const saveBtn = document.getElementById("btnSaveDbConfig");

      // If user kept the masked dots, preserve the already-configured key
      if (key.startsWith("••••") && keyInput.getAttribute("data-has-existing") === "true") {
        key = getSupabaseConfig().key;
      }

      if (!url || !key) {
        showToast("Please enter both Supabase URL and Key.");
        return;
      }

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Testing...";
      }

      try {
        const testRes = await testSupabaseConnection(url, key);
        if (!testRes.success) {
          throw new Error(testRes.error || "Connection failed. Check your URL and Key.");
        }

        setSupabaseConfig(url, key);
        updateDatabaseUI();
        showToast("Connected to Supabase database!");

        // Reload data from Supabase
        const fresh = await fetchLedger();
        setLedgerData(fresh);
        renderSummary();
        renderLedger(isAdminUnlocked());
        closeModal("modalDatabase");
      } catch (err) {
        showToast(`Supabase: ${err.message}`);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Test & Save";
        }
      }
    });
  }

  // Database Disconnect
  const btnDisconnect = document.getElementById("btnDisconnectDb");
  if (btnDisconnect) {
    btnDisconnect.addEventListener("click", () => {
      if (confirm("Disconnect Supabase and switch back to local/server storage?")) {
        setSupabaseConfig("", "");
        updateDatabaseUI();
        closeModal("modalDatabase");
        showToast("Disconnected from Supabase.");
      }
    });
  }
  // Admin button click
  const handleAuthClick = () => {
    if (isAdminUnlocked()) {
      if (confirm("Lock admin mode?")) {
        clearAdminPassword();
        updateAdminUI();
        showToast("Admin locked. Read-only view.");
      }
    } else {
      const input = document.getElementById("adminPasswordInput");
      if (input) input.value = "";
      openModal("modalAdminAuth");
    }
  };

  const adminBtn = document.getElementById("btnAdminAuth");
  if (adminBtn) adminBtn.addEventListener("click", handleAuthClick);

  const stickyAdminBtn = document.getElementById("stickyAdminBtn");
  if (stickyAdminBtn) stickyAdminBtn.addEventListener("click", handleAuthClick);

  // Admin form submit
  const authForm = document.getElementById("formAdminAuth");
  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = (document.getElementById("adminPasswordInput").value || "").trim();
      const submitBtn = document.getElementById("btnSubmitAuth");
      if (submitBtn) submitBtn.disabled = true;

      try {
        await authenticateAdmin(pw);
        closeModal("modalAdminAuth");
        updateAdminUI();
        showToast("Admin unlocked!");
      } catch (err) {
        showToast(err.message || "Invalid password");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Open Add modal
  const openAddModal = () => {
    if (!isAdminUnlocked()) {
      showToast("Unlock admin to add expenses.");
      openModal("modalAdminAuth");
      return;
    }
    const form = document.getElementById("formExpense");
    if (form) form.reset();
    document.getElementById("expenseIdInput").value = "";
    document.getElementById("expenseModalTitle").textContent = "Add Expense";
    document.getElementById("expenseDateInput").value = new Date().toISOString().split("T")[0];
    openModal("modalExpense");
  };

  const addBtn = document.getElementById("btnOpenAddModal");
  if (addBtn) addBtn.addEventListener("click", openAddModal);

  const stickyAddBtn = document.getElementById("stickyAddBtn");
  if (stickyAddBtn) stickyAddBtn.addEventListener("click", openAddModal);

  // Expense form submit (Add or Edit)
  const expenseForm = document.getElementById("formExpense");
  if (expenseForm) {
    expenseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("expenseIdInput").value;
      const payload = {
        date: document.getElementById("expenseDateInput").value,
        amount: parseFloat(document.getElementById("expenseAmountInput").value),
        item: document.getElementById("expenseItemInput").value.trim(),
        category: document.getElementById("expenseCategorySelect").value,
        paidBy: document.getElementById("expensePaidByInput").value.trim() || "All Members",
        notes: document.getElementById("expenseNotesInput").value.trim()
      };

      const saveBtn = document.getElementById("btnSaveExpense");
      if (saveBtn) saveBtn.disabled = true;

      try {
        let updated;
        if (id) {
          updated = await updateExpense(id, payload);
          showToast("Expense updated.");
        } else {
          updated = await addExpense(payload);
          showToast("Expense added.");
        }
        closeModal("modalExpense");
        setLedgerData(updated);
        renderSummary();
        renderLedger(isAdminUnlocked());
      } catch (err) {
        showToast(err.message || "Failed to save.");
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }

  // Edit / Delete button handlers
  const handleAction = (e) => {
    const editBtn = e.target.closest('[data-action="edit"]');
    const delBtn = e.target.closest('[data-action="delete"]');

    if (editBtn) {
      const id = editBtn.getAttribute("data-id");
      if (!id) return;
      const exp = getLedgerData().expenses.find((item) => String(item.id) === String(id));
      if (!exp) return;

      document.getElementById("expenseIdInput").value = exp.id;
      document.getElementById("expenseDateInput").value = exp.date;
      document.getElementById("expenseAmountInput").value = exp.amount;
      document.getElementById("expenseItemInput").value = exp.item;
      document.getElementById("expenseCategorySelect").value = exp.category;
      document.getElementById("expensePaidByInput").value = exp.paidBy || "";
      document.getElementById("expenseNotesInput").value = exp.notes || "";
      document.getElementById("expenseModalTitle").textContent = "Edit Expense";
      openModal("modalExpense");
    }

    if (delBtn) {
      const id = delBtn.getAttribute("data-id");
      if (!id) return;
      deleteTargetId = String(id);
      document.getElementById("deleteItemName").textContent = delBtn.getAttribute("data-item") || "Expense";
      document.getElementById("deleteItemAmount").textContent = formatPeso(delBtn.getAttribute("data-amount"));
      openModal("modalDelete");
    }
  };

  const tableBody = document.getElementById("ledgerTableBody");
  if (tableBody) tableBody.addEventListener("click", handleAction);

  const mobileList = document.getElementById("mobileCardsStream");
  if (mobileList) mobileList.addEventListener("click", handleAction);

  // Confirm delete
  const confirmDel = document.getElementById("btnConfirmDelete");
  if (confirmDel) {
    confirmDel.addEventListener("click", async () => {
      const idToDelete = deleteTargetId;
      deleteTargetId = null;
      if (!idToDelete) {
        closeModal("modalDelete");
        return;
      }

      confirmDel.disabled = true;
      try {
        const updated = await deleteExpense(idToDelete);
        closeModal("modalDelete");
        setLedgerData(updated);
        renderSummary();
        renderLedger(isAdminUnlocked());
        showToast("Expense deleted.");
      } catch (err) {
        showToast(err.message || "Failed to delete.");
      } finally {
        confirmDel.disabled = false;
      }
    });
  }
}
