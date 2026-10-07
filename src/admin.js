// Direct admin mode and CRUD handling

import {
  authenticateAdmin,
  addExpense,
  updateExpense,
  deleteExpense,
  isAdminUnlocked,
  clearAdminPassword
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
  if (el) el.classList.add("hidden");
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
      }, 320);
    });
  });
}

export function updateAdminUI() {
  const isUnlocked = isAdminUnlocked();
  const adminBtn = document.getElementById("btnAdminAuth");
  const adminLabel = document.getElementById("adminBtnLabel");
  const adminIcon = document.getElementById("adminLockIcon");
  const stickyAdminBtn = document.getElementById("stickyAdminBtn");

  if (adminBtn && adminLabel && adminIcon) {
    if (isUnlocked) {
      adminBtn.classList.add("unlocked");
      adminLabel.textContent = "Admin Active (Lock)";
      adminIcon.textContent = "🔓";
    } else {
      adminBtn.classList.remove("unlocked");
      adminLabel.textContent = "Admin Unlock";
      adminIcon.textContent = "🔒";
    }
  }

  if (stickyAdminBtn) {
    stickyAdminBtn.textContent = isUnlocked ? "🔓 Lock" : "🔒 Admin";
  }

  renderLedger(isUnlocked);
}

export function setupAdminActions(showToast) {
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
        setLedgerData(updated);
        renderSummary();
        renderLedger(isAdminUnlocked());
        closeModal("modalExpense");
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
      const exp = getLedgerData().expenses.find((item) => item.id === id);
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
      deleteTargetId = delBtn.getAttribute("data-id");
      document.getElementById("deleteItemName").textContent = delBtn.getAttribute("data-item");
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
      if (!deleteTargetId) return;
      confirmDel.disabled = true;
      try {
        const updated = await deleteExpense(deleteTargetId);
        setLedgerData(updated);
        renderSummary();
        renderLedger(isAdminUnlocked());
        closeModal("modalDelete");
        showToast("Expense deleted.");
      } catch (err) {
        showToast(err.message || "Failed to delete.");
      } finally {
        confirmDel.disabled = false;
        deleteTargetId = null;
      }
    });
  }
}
