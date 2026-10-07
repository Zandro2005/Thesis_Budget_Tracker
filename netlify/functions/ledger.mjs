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

// In-memory fallback if Blobs environment is not provisioned
let inMemoryLedger = JSON.parse(JSON.stringify(DEFAULT_DATA));

function checkAuth(req) {
  const adminPassword = process.env.ADMIN_PASSWORD || "0907133ado";
  const providedPassword = req.headers.get("x-admin-password");
  return Boolean(providedPassword && providedPassword === adminPassword);
}

async function getStoreSafe() {
  try {
    const store = getStore("thesis_budget");
    return store;
  } catch (err) {
    console.warn("Netlify Blobs unavailable in this environment:", err.message);
    return null;
  }
}

async function loadLedger(store) {
  if (store) {
    try {
      const data = await store.get("ledger_data", { type: "json" });
      if (data) return data;
      // Initialize with baseline data
      await store.setJSON("ledger_data", inMemoryLedger);
      return inMemoryLedger;
    } catch (err) {
      console.warn("Store read error, using fallback:", err.message);
    }
  }
  return inMemoryLedger;
}

async function saveLedger(store, data) {
  inMemoryLedger = data;
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

    // 3. POST /api/expenses
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

      const newExpense = {
        id: "exp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        date,
        item,
        category,
        amount,
        paidBy,
        notes
      };

      ledger.expenses.unshift(newExpense);
      ledger.updatedAt = new Date().toISOString();
      await saveLedger(store, ledger);

      return new Response(JSON.stringify(ledger), { status: 201, headers: responseHeaders });
    }

    // 4. PUT /api/expenses/:id
    if (pathname.includes("/api/expenses/") && method === "PUT") {
      const id = pathname.split("/api/expenses/")[1]?.split("/")[0]?.split("?")[0];
      const index = ledger.expenses.findIndex((e) => e.id === id);
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

    // 5. DELETE /api/expenses/:id
    if (pathname.includes("/api/expenses/") && method === "DELETE") {
      const id = pathname.split("/api/expenses/")[1]?.split("/")[0]?.split("?")[0];
      const initLen = ledger.expenses.length;
      ledger.expenses = ledger.expenses.filter((e) => e.id !== id);

      if (ledger.expenses.length === initLen) {
        return new Response(
          JSON.stringify({ success: false, message: "Expense not found." }),
          { status: 404, headers: responseHeaders }
        );
      }

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
