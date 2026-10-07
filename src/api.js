// API Client with resilient localStorage persistence for Thesis Budget Tracker

const STORAGE_KEY_PW = "thesis_budget_admin_pw";
const STORAGE_KEY_LEDGER = "thesis_budget_ledger_cache";

export function getAdminPassword() {
  return sessionStorage.getItem(STORAGE_KEY_PW) || "";
}

export function setAdminPassword(pw) {
  sessionStorage.setItem(STORAGE_KEY_PW, pw);
}

export function clearAdminPassword() {
  sessionStorage.removeItem(STORAGE_KEY_PW);
}

export function isAdminUnlocked() {
  return Boolean(getAdminPassword());
}

export function getCachedLedger() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEDGER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedLedger(data) {
  try {
    if (data && Array.isArray(data.expenses)) {
      localStorage.setItem(STORAGE_KEY_LEDGER, JSON.stringify(data));
    }
  } catch (e) {
    console.warn("Could not cache ledger to localStorage:", e);
  }
}

async function request(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const adminPw = getAdminPassword();
  if (adminPw) {
    headers["x-admin-password"] = adminPw;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errorMsg = `Request failed: ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.message) errorMsg = errJson.message;
    } catch {
      // Keep default error message
    }
    const error = new Error(errorMsg);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchLedger() {
  const cached = getCachedLedger();
  try {
    const data = await request("/api/ledger", { method: "GET" });
    if (data && Array.isArray(data.expenses)) {
      // If server returned expenses, persist to local cache
      if (data.expenses.length > 0) {
        saveCachedLedger(data);
        return data;
      }
      // If server is empty but client has cached data, prioritize client data to prevent accidental loss
      if (cached && cached.expenses && cached.expenses.length > 0) {
        return cached;
      }
      saveCachedLedger(data);
      return data;
    }
    return cached || data;
  } catch (err) {
    console.warn("Server ledger fetch error, falling back to local cache:", err.message);
    if (cached) return cached;
    return {
      totalBudget: 15000,
      currency: "PHP",
      title: "Thesis Capstone Budget",
      expenses: []
    };
  }
}

export async function authenticateAdmin(password) {
  const result = await request("/api/auth", {
    method: "POST",
    headers: { "x-admin-password": password },
    body: JSON.stringify({ password })
  });
  if (result.success) {
    setAdminPassword(password);
  }
  return result;
}

export async function addExpense(expenseData) {
  try {
    const result = await request("/api/expenses", {
      method: "POST",
      body: JSON.stringify(expenseData)
    });
    saveCachedLedger(result);
    return result;
  } catch (err) {
    console.warn("Backend add failed, saving to local cache:", err.message);
    const cached = getCachedLedger() || {
      totalBudget: 15000,
      currency: "PHP",
      title: "Thesis Capstone Budget",
      expenses: []
    };
    const newExp = {
      id: "exp-" + Date.now(),
      ...expenseData
    };
    cached.expenses.unshift(newExp);
    cached.updatedAt = new Date().toISOString();
    saveCachedLedger(cached);
    return cached;
  }
}

export async function updateExpense(id, expenseData) {
  try {
    const result = await request(`/api/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(expenseData)
    });
    saveCachedLedger(result);
    return result;
  } catch (err) {
    console.warn("Backend update failed, saving to local cache:", err.message);
    const cached = getCachedLedger() || {
      totalBudget: 15000,
      currency: "PHP",
      title: "Thesis Capstone Budget",
      expenses: []
    };
    const idx = cached.expenses.findIndex((e) => e.id === id);
    if (idx !== -1) {
      cached.expenses[idx] = { ...cached.expenses[idx], ...expenseData };
    }
    cached.updatedAt = new Date().toISOString();
    saveCachedLedger(cached);
    return cached;
  }
}

export async function deleteExpense(id) {
  try {
    const result = await request(`/api/expenses/${id}`, {
      method: "DELETE"
    });
    saveCachedLedger(result);
    return result;
  } catch (err) {
    console.warn("Backend delete failed, saving to local cache:", err.message);
    const cached = getCachedLedger() || {
      totalBudget: 15000,
      currency: "PHP",
      title: "Thesis Capstone Budget",
      expenses: []
    };
    cached.expenses = cached.expenses.filter((e) => e.id !== id);
    cached.updatedAt = new Date().toISOString();
    saveCachedLedger(cached);
    return cached;
  }
}
