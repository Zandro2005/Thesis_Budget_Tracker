import { getStore } from "@netlify/blobs";
import fs from "node:fs";
import path from "node:path";

export const config = {
  path: "/api/*"
};

// Initial default data, seeded from committed data/ledger.json if available
let DEFAULT_DATA = {
  totalBudget: 15000,
  currency: "PHP",
  title: "Thesis Capstone Budget",
  updatedAt: new Date().toISOString(),
  expenses: []
};

try {
  const seedPath = path.resolve(process.cwd(), "data/ledger.json");
  if (fs.existsSync(seedPath)) {
    const raw = fs.readFileSync(seedPath, "utf-8");
    DEFAULT_DATA = JSON.parse(raw);
  }
} catch (e) {
  console.warn("Could not load seed data/ledger.json:", e.message);
}

// In-memory fallback
let inMemoryLedger = JSON.parse(JSON.stringify(DEFAULT_DATA));

// Lambda /tmp secondary cache file
const TMP_FILE = path.join("/tmp", "thesis_budget_ledger.json");

function readTmpLedger() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const raw = fs.readFileSync(TMP_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.expenses)) {
        return parsed;
      }
    }
  } catch {}
  return null;
}

function writeTmpLedger(data) {
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data), "utf-8");
  } catch {}
}

function checkAuth(req) {
  const adminPassword = process.env.ADMIN_PASSWORD || "0907133ado";
  const providedPassword = req.headers.get("x-admin-password");
  return Boolean(providedPassword && providedPassword === adminPassword);
}

async function getStoreSafe() {
  try {
    const store = getStore({ name: "thesis_budget", consistency: "strong" });
    return store;
  } catch (err) {
    try {
      const store = getStore("thesis_budget");
      return store;
    } catch (e) {
      console.warn("Netlify Blobs unavailable in this environment:", e.message);
      return null;
    }
  }
}

async function loadLedger(store) {
  if (store) {
    try {
      const data = await store.get("ledger_data", { type: "json", consistency: "strong" });
      if (data && Array.isArray(data.expenses)) {
        inMemoryLedger = data;
        writeTmpLedger(data);
        return data;
      }
    } catch (err) {
      console.warn("Store read error, attempting /tmp fallback:", err.message);
    }
  }

  // Fallback to /tmp filesystem cache
  const tmpData = readTmpLedger();
  if (tmpData && Array.isArray(tmpData.expenses) && tmpData.expenses.length > 0) {
    inMemoryLedger = tmpData;
    return tmpData;
  }

  return inMemoryLedger;
}

async function saveLedger(store, data) {
  inMemoryLedger = data;
  writeTmpLedger(data);
  if (store) {
    try {
      await store.setJSON("ledger_data", data);
    } catch (err) {
      console.warn("Store write error:", err.message);
    }
  }
}

export default async (req, context) => {
  const url = new URL(req.url);
  let pathname = url.pathname;
  if (pathname.includes("/.netlify/functions/ledger")) {
    pathname = pathname.replace("/.netlify/functions/ledger", "") || "/api/ledger";
    if (!pathname.startsWith("/api")) pathname = "/api" + pathname;
  }
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-admin-password"
      }
    });
  }

  const responseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  };

  try {
    const store = await getStoreSafe();
    let ledger = await loadLedger(store);

    // 1. GET /api/ledger
    if (pathname === "/api/ledger" && method === "GET") {
      return new Response(JSON.stringify(ledger), {
        status: 200,
        headers: responseHeaders
      });
    }

    // 2. POST /api/auth
    if (pathname === "/api/auth" && method === "POST") {
      const isAuthed = checkAuth(req);
      if (!isAuthed) {
        return new Response(
          JSON.stringify({ success: false, message: "Invalid admin password" }),
          { status: 401, headers: responseHeaders }
        );
      }
      return new Response(
        JSON.stringify({ success: true, message: "Authenticated" }),
        { status: 200, headers: responseHeaders }
      );
    }

    // Protected operations require auth
    if (!checkAuth(req)) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized. Admin password required." }),
        { status: 401, headers: responseHeaders }
      );
    }

    // 3. POST /api/sync or PUT /api/ledger - Full sync from client
    if (
      (pathname === "/api/sync" && method === "POST") ||
      (pathname === "/api/ledger" && method === "PUT")
    ) {
      const body = await req.json();
      if (body && Array.isArray(body.expenses)) {
        // Merge client expenses with existing server expenses by ID
        const map = new Map();
        for (const exp of ledger.expenses || []) {
          if (exp && exp.id) map.set(String(exp.id), exp);
        }
        for (const exp of body.expenses) {
          if (exp && exp.id) map.set(String(exp.id), exp);
        }
        ledger.expenses = Array.from(map.values()).sort((a, b) => {
          return String(b.date || "").localeCompare(String(a.date || ""));
        });
        if (typeof body.totalBudget === "number" && body.totalBudget > 0) {
          ledger.totalBudget = body.totalBudget;
        }
        ledger.updatedAt = new Date().toISOString();
        await saveLedger(store, ledger);
        return new Response(JSON.stringify(ledger), { status: 200, headers: responseHeaders });
      }
    }

    // 4. PUT /api/budget - Update budget cap
    if (pathname === "/api/budget" && method === "PUT") {
      const body = await req.json();
      if (typeof body.totalBudget === "number" && body.totalBudget > 0) {
        ledger.totalBudget = body.totalBudget;
      }
      ledger.updatedAt = new Date().toISOString();
      await saveLedger(store, ledger);
      return new Response(JSON.stringify(ledger), { status: 200, headers: responseHeaders });
    }

    // 5. POST /api/expenses - Add an expense
    if (pathname === "/api/expenses" && method === "POST") {
      const body = await req.json();
      const amount = parseFloat(body.amount);
      const item = (body.item || "").trim();
      const category = (body.category || "Miscellaneous").trim();
      const paidBy = (body.paidBy || "All Members").trim();
      const date = (body.date || new Date().toISOString().split("T")[0]).trim();
      const notes = (body.notes || "").trim();

      if (!item || isNaN(amount) || amount <= 0) {
        return new Response(
          JSON.stringify({ success: false, message: "Valid item and positive amount required." }),
          { status: 400, headers: responseHeaders }
        );
      }

      const id = String(body.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

      const newExpense = {
        id,
        date,
        item,
        category,
        amount,
        paidBy,
        notes
      };

      // Check if already exists (avoid duplicate)
      const existingIdx = (ledger.expenses || []).findIndex((e) => String(e.id) === id);
      if (existingIdx !== -1) {
        ledger.expenses[existingIdx] = newExpense;
      } else {
        ledger.expenses = [newExpense, ...(ledger.expenses || [])];
      }

      ledger.updatedAt = new Date().toISOString();
      await saveLedger(store, ledger);

      return new Response(JSON.stringify(ledger), { status: 201, headers: responseHeaders });
    }

    // 6. PUT /api/expenses/:id - Edit an expense
    if (pathname.includes("/api/expenses/") && method === "PUT") {
      const id = pathname.split("/api/expenses/")[1]?.split("/")[0]?.split("?")[0];
      const index = (ledger.expenses || []).findIndex((e) => String(e.id) === String(id));
      if (index === -1) {
        return new Response(
          JSON.stringify({ success: false, message: "Expense not found." }),
          { status: 404, headers: responseHeaders }
        );
      }

      const body = await req.json();
      const amount = parseFloat(body.amount);
      const item = (body.item || "").trim();

      if (!item || isNaN(amount) || amount <= 0) {
        return new Response(
          JSON.stringify({ success: false, message: "Valid item and amount required." }),
          { status: 400, headers: responseHeaders }
        );
      }

      ledger.expenses[index] = {
        ...ledger.expenses[index],
        date: body.date || ledger.expenses[index].date,
        item,
        category: body.category || ledger.expenses[index].category,
        amount,
        paidBy: body.paidBy || ledger.expenses[index].paidBy,
        notes: body.notes !== undefined ? body.notes : ledger.expenses[index].notes
      };
      ledger.updatedAt = new Date().toISOString();
      await saveLedger(store, ledger);

      return new Response(JSON.stringify(ledger), { status: 200, headers: responseHeaders });
    }

    // 7. DELETE /api/expenses/:id - Delete an expense (Idempotent)
    if (pathname.includes("/api/expenses/") && method === "DELETE") {
      const id = pathname.split("/api/expenses/")[1]?.split("/")[0]?.split("?")[0];
      ledger.expenses = (ledger.expenses || []).filter((e) => String(e.id) !== String(id));
      ledger.updatedAt = new Date().toISOString();
      await saveLedger(store, ledger);

      return new Response(JSON.stringify(ledger), { status: 200, headers: responseHeaders });
    }

    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404,
      headers: responseHeaders
    });
  } catch (err) {
    console.error("Function fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: responseHeaders }
    );
  }
};
