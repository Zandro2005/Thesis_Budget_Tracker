// Supabase Client and Realtime Sync for Thesis Budget Tracker
import { createClient } from "@supabase/supabase-js";

const STORAGE_KEY_URL = "thesis_supabase_url";
const STORAGE_KEY_KEY = "thesis_supabase_key";

let supabaseInstance = null;
let currentUrl = null;
let currentKey = null;

export function getSupabaseConfig() {
  const envUrl = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || "";
  const envKey = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || "";

  const storedUrl = localStorage.getItem(STORAGE_KEY_URL) || "";
  const storedKey = localStorage.getItem(STORAGE_KEY_KEY) || "";

  return {
    url: (storedUrl || envUrl).trim(),
    key: (storedKey || envKey).trim()
  };
}

export function setSupabaseConfig(url, key) {
  if (url) localStorage.setItem(STORAGE_KEY_URL, url.trim());
  else localStorage.removeItem(STORAGE_KEY_URL);

  if (key) localStorage.setItem(STORAGE_KEY_KEY, key.trim());
  else localStorage.removeItem(STORAGE_KEY_KEY);

  // Force re-initialization of client
  supabaseInstance = null;
  currentUrl = null;
  currentKey = null;
}

export function isSupabaseConfigured() {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key && url.startsWith("http"));
}

export function getSupabaseClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  if (supabaseInstance && currentUrl === url && currentKey === key) {
    return supabaseInstance;
  }

  try {
    supabaseInstance = createClient(url, key, {
      auth: { persistSession: false }
    });
    currentUrl = url;
    currentKey = key;
    return supabaseInstance;
  } catch (err) {
    console.warn("Failed to initialize Supabase client:", err);
    return null;
  }
}

export async function testSupabaseConnection(url, key) {
  try {
    const testClient = createClient(url, key, {
      auth: { persistSession: false }
    });
    const { error } = await testClient.from("expenses").select("id").limit(1);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function fetchSupabaseLedger() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");

  // 1. Fetch expenses
  const { data: expensesData, error: expError } = await client
    .from("expenses")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (expError) throw expError;

  // 2. Fetch budget config if present
  let totalBudget = 15000;
  let currency = "PHP";
  let title = "Thesis Capstone Budget";

  try {
    const { data: cfgData } = await client
      .from("budget_config")
      .select("*")
      .eq("id", "main")
      .maybeSingle();

    if (cfgData) {
      if (typeof cfgData.total_budget === "number") totalBudget = cfgData.total_budget;
      if (cfgData.currency) currency = cfgData.currency;
      if (cfgData.title) title = cfgData.title;
    }
  } catch {
    // budget_config table optional
  }

  const mappedExpenses = (expensesData || []).map((row) => ({
    id: String(row.id),
    date: row.date || new Date().toISOString().split("T")[0],
    item: row.item || "Expense",
    category: row.category || "Miscellaneous",
    amount: Number(row.amount) || 0,
    paidBy: row.paid_by || "All Members",
    notes: row.notes || ""
  }));

  return {
    totalBudget,
    currency,
    title,
    updatedAt: new Date().toISOString(),
    expenses: mappedExpenses
  };
}

export async function addSupabaseExpense(expense) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");

  const row = {
    id: String(expense.id),
    date: expense.date,
    item: expense.item,
    category: expense.category,
    amount: Number(expense.amount),
    paid_by: expense.paidBy || "All Members",
    notes: expense.notes || ""
  };

  const { error } = await client.from("expenses").upsert(row, { onConflict: "id" });
  if (error) throw error;
  return row;
}

export async function updateSupabaseExpense(id, expense) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");

  const row = {
    date: expense.date,
    item: expense.item,
    category: expense.category,
    amount: Number(expense.amount),
    paid_by: expense.paidBy || "All Members",
    notes: expense.notes || ""
  };

  const { error } = await client.from("expenses").update(row).eq("id", String(id));
  if (error) throw error;
  return row;
}

export async function deleteSupabaseExpense(id) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");

  const { error } = await client.from("expenses").delete().eq("id", String(id));
  if (error) throw error;
  return true;
}

export function subscribeToSupabaseRealtime(onUpdate) {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const channel = client
      .channel("public:expenses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        (payload) => {
          if (typeof onUpdate === "function") {
            onUpdate(payload);
          }
        }
      )
      .subscribe();

    return channel;
  } catch (err) {
    console.warn("Realtime subscription warning:", err);
    return null;
  }
}
