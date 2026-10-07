// API Client with Supabase database integration, resilient localStorage persistence, and two-way sync
import {
  isSupabaseConfigured,
  getSupabaseConfig,
  setSupabaseConfig,
  testSupabaseConnection,
  fetchSupabaseLedger,
  addSupabaseExpense,
  updateSupabaseExpense,
  deleteSupabaseExpense,
  subscribeToSupabaseRealtime
} from "./supabase.js";

export {
  isSupabaseConfigured,
  getSupabaseConfig,
  setSupabaseConfig,
  testSupabaseConnection,
  subscribeToSupabaseRealtime
};

const STORAGE_KEY_PW = "thesis_budget_admin_pw";
const STORAGE_KEY_LEDGER = "thesis_budget_ledger_cache";
const STORAGE_KEY_DELETED = "thesis_budget_deleted_ids";

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

export function generateExpenseId() {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDeletedIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function markAsDeleted(id) {
  if (!id) return;
  try {
    const ids = getDeletedIds();
    ids.add(String(id));
    localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify([...ids]));
  } catch (e) {
    console.warn("Could not record deleted ID:", e);
  }
}

export function unmarkAsDeleted(id) {
  if (!id) return;
  try {
    const ids = getDeletedIds();
    ids.delete(String(id));
    localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify([...ids]));
  } catch (e) {
    console.warn("Could not unmark deleted ID:", e);
  }
}

export function getCachedLedger() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEDGER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.expenses)) {
      return parsed;
    }
    return null;
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

/**
 * Merge local and remote ledgers safely.
 * 1. Honors tombstones (deleted IDs are NEVER resurrected).
 * 2. Deduplicates by ID.
 * 3. Never deletes local expenses that the server might have missed during cold restarts.
 */
export function mergeLedgers(local, remote) {
  const deletedIds = getDeletedIds();

  const base = {
    totalBudget: (remote && remote.totalBudget) || (local && local.totalBudget) || 15000,
    currency: (remote && remote.currency) || (local && local.currency) || "PHP",
    title: (remote && remote.title) || (local && local.title) || "Thesis Capstone Budget",
    updatedAt: new Date().toISOString()
  };

  const localList = (local && Array.isArray(local.expenses)) ? local.expenses : [];
  const remoteList = (remote && Array.isArray(remote.expenses)) ? remote.expenses : [];

  const map = new Map();

  // 1. Ingest remote expenses (skip any deleted items)
  for (const exp of remoteList) {
    if (exp && exp.id) {
      const sid = String(exp.id);
      if (!deletedIds.has(sid)) {
        map.set(sid, {
          ...exp,
          id: sid,
          amount: Number(exp.amount) || 0
        });
      }
    }
  }

  // 2. Ingest local expenses (preserve newly added items that remote hasn't seen yet)
  for (const exp of localList) {
    if (exp && exp.id) {
      const sid = String(exp.id);
      if (!deletedIds.has(sid)) {
        if (!map.has(sid)) {
          map.set(sid, {
            ...exp,
            id: sid,
            amount: Number(exp.amount) || 0
          });
        }
      }
    }
  }

  // 3. Stable sort by date descending (newest first)
  const mergedExpenses = Array.from(map.values()).sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    return db.localeCompare(da);
  });

  return {
    ...base,
    expenses: mergedExpenses
  };
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

  // 1. Try Supabase if configured (most reliable cloud database)
  if (isSupabaseConfigured()) {
    try {
      const sbData = await fetchSupabaseLedger();
      if (sbData && Array.isArray(sbData.expenses)) {
        const merged = mergeLedgers(cached, sbData);
        saveCachedLedger(merged);
        return merged;
      }
    } catch (err) {
      console.warn("Supabase fetch failed, falling back to cached/api ledger:", err.message);
    }
  }

  // 2. Fallback to /api/ledger
  try {
    const data = await request("/api/ledger", { method: "GET" });
    if (data && Array.isArray(data.expenses)) {
      const merged = mergeLedgers(cached, data);
      saveCachedLedger(merged);

      if (isAdminUnlocked() && Array.isArray(merged.expenses) && merged.expenses.length > data.expenses.length) {
        syncToServer(merged).catch(() => {});
      }

      return merged;
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
  const newId = expenseData.id || generateExpenseId();
  unmarkAsDeleted(newId);

  const newExp = {
    ...expenseData,
    id: newId,
    amount: Number(expenseData.amount) || 0
  };

  // Step 1: Immediate local state update so nothing is ever lost
  const cached = getCachedLedger() || {
    totalBudget: 15000,
    currency: "PHP",
    title: "Thesis Capstone Budget",
    expenses: []
  };

  const existingExpenses = (cached.expenses || []).filter((e) => String(e.id) !== String(newId));
  cached.expenses = [newExp, ...existingExpenses];
  cached.updatedAt = new Date().toISOString();
  saveCachedLedger(cached);

  // Step 2: Push to Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      await addSupabaseExpense(newExp);
    } catch (sbErr) {
      console.warn("Supabase add error, queued locally:", sbErr.message);
    }
  }

  // Step 3: Push to backend server
  try {
    const result = await request("/api/expenses", {
      method: "POST",
      body: JSON.stringify(newExp)
    });
    const merged = mergeLedgers(cached, result);
    saveCachedLedger(merged);
    return merged;
  } catch (err) {
    console.warn("Backend add failed, saved locally:", err.message);
    return cached;
  }
}

export async function updateExpense(id, expenseData) {
  const strId = String(id);
  const cached = getCachedLedger() || {
    totalBudget: 15000,
    currency: "PHP",
    title: "Thesis Capstone Budget",
    expenses: []
  };

  const idx = (cached.expenses || []).findIndex((e) => String(e.id) === strId);
  if (idx !== -1) {
    cached.expenses[idx] = {
      ...cached.expenses[idx],
      ...expenseData,
      id: strId,
      amount: Number(expenseData.amount) || 0
    };
  }
  cached.updatedAt = new Date().toISOString();
  saveCachedLedger(cached);

  // Push to Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      await updateSupabaseExpense(strId, expenseData);
    } catch (sbErr) {
      console.warn("Supabase update error:", sbErr.message);
    }
  }

  try {
    const result = await request(`/api/expenses/${encodeURIComponent(strId)}`, {
      method: "PUT",
      body: JSON.stringify(expenseData)
    });
    const merged = mergeLedgers(cached, result);
    saveCachedLedger(merged);
    return merged;
  } catch (err) {
    console.warn("Backend update failed, saved locally:", err.message);
    return cached;
  }
}

export async function deleteExpense(id) {
  if (!id) {
    return getCachedLedger() || {
      totalBudget: 15000,
      currency: "PHP",
      title: "Thesis Capstone Budget",
      expenses: []
    };
  }

  const strId = String(id);
  markAsDeleted(strId);

  // Step 1: Remove ONLY this id locally immediately
  const cached = getCachedLedger() || {
    totalBudget: 15000,
    currency: "PHP",
    title: "Thesis Capstone Budget",
    expenses: []
  };

  cached.expenses = (cached.expenses || []).filter((e) => String(e.id) !== strId);
  cached.updatedAt = new Date().toISOString();
  saveCachedLedger(cached);

  // Step 2: Delete from Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      await deleteSupabaseExpense(strId);
    } catch (sbErr) {
      console.warn("Supabase delete error:", sbErr.message);
    }
  }

  // Step 3: Tell server to delete
  try {
    const result = await request(`/api/expenses/${encodeURIComponent(strId)}`, {
      method: "DELETE"
    });
    const merged = mergeLedgers(cached, result);
    merged.expenses = (merged.expenses || []).filter((e) => String(e.id) !== strId);
    saveCachedLedger(merged);
    return merged;
  } catch (err) {
    console.warn("Backend delete failed, removed locally:", err.message);
    return cached;
  }
}

export async function syncToServer(ledgerData) {
  try {
    const result = await request("/api/sync", {
      method: "POST",
      body: JSON.stringify(ledgerData)
    });
    if (result && Array.isArray(result.expenses)) {
      saveCachedLedger(result);
      return result;
    }
  } catch (err) {
    console.warn("Sync to server failed:", err.message);
  }
  return ledgerData;
}
