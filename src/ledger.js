// Clean, direct ledger state and rendering module

let currentLedger = {
  totalBudget: 15000,
  currency: "PHP",
  expenses: []
};

let currentFilter = {
  category: "ALL",
  searchQuery: ""
};

export function setLedgerData(data) {
  if (data) {
    currentLedger = {
      ...currentLedger,
      ...data,
      expenses: Array.isArray(data.expenses) ? data.expenses : []
    };
  }
}

export function getLedgerData() {
  return currentLedger;
}

export function setFilter(key, value) {
  currentFilter[key] = value;
}

export function formatPeso(amount) {
  const num = typeof amount === "number" ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function getFilteredExpenses() {
  let list = [...currentLedger.expenses];

  if (currentFilter.category && currentFilter.category !== "ALL") {
    list = list.filter((e) => e.category === currentFilter.category);
  }

  const q = currentFilter.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((e) => {
      const item = (e.item || "").toLowerCase();
      const paidBy = (e.paidBy || "").toLowerCase();
      const notes = (e.notes || "").toLowerCase();
      return item.includes(q) || paidBy.includes(q) || notes.includes(q);
    });
  }

  return list;
}

export function renderSummary() {
  const totalBudget = currentLedger.totalBudget || 15000;
  const totalSpent = currentLedger.expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const remaining = totalBudget - totalSpent;
  const spentPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remainingPct = totalBudget > 0 ? (remaining / totalBudget) * 100 : 0;

  // Spent, Remaining, and Utilization displays
  const spentEl = document.getElementById("totalSpentDisplay");
  const remainingEl = document.getElementById("totalRemainingDisplay");
  const stickyRemainingEl = document.getElementById("stickyRemaining");
  const utilEl = document.getElementById("utilizationDisplay");

  if (spentEl) spentEl.textContent = formatPeso(totalSpent);
  if (remainingEl) remainingEl.textContent = formatPeso(remaining);
  if (stickyRemainingEl) stickyRemainingEl.textContent = formatPeso(remaining);

  if (utilEl) {
    utilEl.textContent = `${spentPct.toFixed(1)}%`;
    if (spentPct >= 85) {
      utilEl.className = "metric-val text-spent";
    } else if (spentPct >= 70) {
      utilEl.className = "metric-val text-warning";
    } else {
      utilEl.className = "metric-val text-remaining";
    }
  }

  // Progress Bar
  const spentPctEl = document.getElementById("spentPercentText");
  const remainingPctEl = document.getElementById("remainingPercentText");
  const progressFill = document.getElementById("progressFill");

  if (spentPctEl) spentPctEl.textContent = `${spentPct.toFixed(1)}%`;
  if (remainingPctEl) remainingPctEl.textContent = `${Math.max(remainingPct, 0).toFixed(1)}% Left`;

  if (progressFill) {
    progressFill.style.width = `${Math.min(spentPct, 100)}%`;
    if (spentPct >= 85) {
      progressFill.className = "progress-fill critical";
    } else if (spentPct >= 70) {
      progressFill.className = "progress-fill warning";
    } else {
      progressFill.className = "progress-fill";
    }
  }
}

export function renderLedger(isAdmin = false) {
  const filtered = getFilteredExpenses();
  const emptyState = document.getElementById("emptyState");
  const desktopTable = document.querySelector(".table-card");
  const mobileCards = document.getElementById("mobileCardsStream");

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    if (desktopTable) desktopTable.classList.add("hidden");
    if (mobileCards) mobileCards.classList.add("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");
  if (desktopTable) desktopTable.classList.remove("hidden");
  if (mobileCards) mobileCards.classList.remove("hidden");

  // 1. Desktop Table
  const tableBody = document.getElementById("ledgerTableBody");
  if (tableBody) {
    tableBody.innerHTML = filtered
      .map((item) => `
        <tr data-id="${item.id}">
          <td class="td-date">${formatDate(item.date)}</td>
          <td class="td-item">${escapeHtml(item.item)}</td>
          <td><span class="td-cat">${escapeHtml(item.category)}</span></td>
          <td class="td-amount">${formatPeso(item.amount)}</td>
          <td>${escapeHtml(item.paidBy || "—")}</td>
          <td class="td-notes">${escapeHtml(item.notes || "—")}</td>
          <td class="col-actions admin-only ${isAdmin ? "" : "hidden"}">
            <div class="row-actions">
              <button class="btn-icon-btn btn-edit" data-action="edit" data-id="${item.id}">Edit</button>
              <button class="btn-icon-btn btn-del" data-action="delete" data-id="${item.id}" data-item="${escapeHtml(item.item)}" data-amount="${item.amount}">Delete</button>
            </div>
          </td>
        </tr>
      `)
      .join("");
  }

  // 2. Mobile Cards
  if (mobileCards) {
    mobileCards.innerHTML = filtered
      .map((item) => `
        <div class="card-item-mobile" data-id="${item.id}">
          <div class="card-item-top">
            <span class="card-item-title">${escapeHtml(item.item)}</span>
            <span class="card-item-amount">${formatPeso(item.amount)}</span>
          </div>
          <div class="card-item-meta">
            <span class="td-cat">${escapeHtml(item.category)}</span>
            <span>•</span>
            <span>${formatDate(item.date)}</span>
            <span>•</span>
            <span>Paid by: <strong>${escapeHtml(item.paidBy || "All")}</strong></span>
          </div>
          ${item.notes ? `<div class="card-item-notes">${escapeHtml(item.notes)}</div>` : ""}
          ${isAdmin ? `
            <div class="card-item-bottom">
              <span>Admin Actions</span>
              <div class="row-actions">
                <button class="btn-icon-btn btn-edit" data-action="edit" data-id="${item.id}">Edit</button>
                <button class="btn-icon-btn btn-del" data-action="delete" data-id="${item.id}" data-item="${escapeHtml(item.item)}" data-amount="${item.amount}">Delete</button>
              </div>
            </div>
          ` : ""}
        </div>
      `)
      .join("");
  }

  // Toggle table action header
  document.querySelectorAll("th.col-actions").forEach((th) => {
    th.classList.toggle("hidden", !isAdmin);
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
