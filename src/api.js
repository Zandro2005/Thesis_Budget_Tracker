// API Client for Thesis Budget Tracker

const STORAGE_KEY_PW = "thesis_budget_admin_pw";

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
  return request("/api/ledger", { method: "GET" });
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
  return request("/api/expenses", {
    method: "POST",
    body: JSON.stringify(expenseData)
  });
}

export async function updateExpense(id, expenseData) {
  return request(`/api/expenses/${id}`, {
    method: "PUT",
    body: JSON.stringify(expenseData)
  });
}

export async function deleteExpense(id) {
  return request(`/api/expenses/${id}`, {
    method: "DELETE"
  });
}

export async function updateBudget(totalBudget) {
  return request("/api/budget", {
    method: "PUT",
    body: JSON.stringify({ totalBudget: Number(totalBudget) })
  });
}
