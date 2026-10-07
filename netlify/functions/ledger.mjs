import { getStore } from "@netlify/blobs";

export const config = {
  path: [
    "/api/ledger",
    "/api/auth",
    "/api/expenses",
    "/api/expenses/:id",
    "/api/budget"
  ]
};

const DEFAULT_DATA = {
  totalBudget: 15000,
  currency: "PHP",
  title: "Thesis Capstone Budget",
  updatedAt: new Date().toISOString(),
  expenses: [
    {
      id: "seed-1",
      date: "2026-10-01",
      item: "Survey Questionnaires Pilot Print (50 sets)",
      category: "Printing & Binding",
      amount: 450,
      paidBy: "Team Lead",
      notes: "Initial pilot test copies"
    },
    {
      id: "seed-2",
      date: "2026-10-03",
      item: "Prototype Components & Materials",
      category: "Materials & Supplies",
      amount: 1850,
      paidBy: "Hardware Lead",
      notes: "Sensors and test harness"
    },
    {
      id: "seed-3",
      date: "2026-10-05",
      item: "Field Research Transportation Fare",
      category: "Transportation",
      amount: 620,
      paidBy: "All Members",
      notes: "Site visit and interviews"
    }
  ]
};

function checkAuth(req) {
  const adminPassword = process.env.ADMIN_PASSWORD || "0907133ado";
  const providedPassword = req.headers.get("x-admin-password");
  return providedPassword && providedPassword === adminPassword;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS preflight if called cross-origin
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
    const store = getStore("thesis_budget");
    let ledger = await store.get("ledger_data", { type: "json" });

    if (!ledger) {
      ledger = DEFAULT_DATA;
      try {
        await store.setJSON("ledger_data", ledger);
      } catch (e) {
        console.warn("Could not write default data to store:", e.message);
      }
    }

    // 1. GET /api/ledger - Public view
    if (pathname === "/api/ledger" && method === "GET") {
      return new Response(JSON.stringify(ledger), {
        status: 200,
        headers: responseHeaders
      });
    }

    // 2. POST /api/auth - Verify admin password
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

    // All subsequent actions require admin authentication
    if (!checkAuth(req)) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized. Admin password required." }),
        { status: 401, headers: responseHeaders }
      );
    }

    // 3. PUT /api/budget - Update total budget or title
    if (pathname === "/api/budget" && method === "PUT") {
      const body = await req.json();
      if (typeof body.totalBudget === "number" && body.totalBudget > 0) {
        ledger.totalBudget = body.totalBudget;
      }
      if (typeof body.title === "string" && body.title.trim()) {
        ledger.title = body.title.trim();
      }
      ledger.updatedAt = new Date().toISOString();
      await store.setJSON("ledger_data", ledger);
      return new Response(JSON.stringify(ledger), { status: 200, headers: responseHeaders });
    }

    // 4. POST /api/expenses - Add new expense
    if (pathname === "/api/expenses" && method === "POST") {
      const body = await req.json();
      const amount = parseFloat(body.amount);
      const item = (body.item || "").trim();
      const category = (body.category || "Miscellaneous").trim();
      const paidBy = (body.paidBy || "Unspecified").trim();
      const date = (body.date || new Date().toISOString().split("T")[0]).trim();
      const notes = (body.notes || "").trim();

      if (!item) {
        return new Response(
          JSON.stringify({ success: false, message: "Expense item description is required." }),
          { status: 400, headers: responseHeaders }
        );
      }
      if (isNaN(amount) || amount <= 0) {
        return new Response(
          JSON.stringify({ success: false, message: "Valid positive amount is required." }),
          { status: 400, headers: responseHeaders }
        );
      }

      const newExpense = {
        id: crypto.randomUUID(),
        date,
        item,
        category,
        amount,
        paidBy,
        notes
      };

      ledger.expenses.unshift(newExpense);
      ledger.updatedAt = new Date().toISOString();
      await store.setJSON("ledger_data", ledger);

      return new Response(JSON.stringify(ledger), { status: 201, headers: responseHeaders });
    }

    // 5. PUT /api/expenses/:id - Edit expense
    if (pathname.startsWith("/api/expenses/") && method === "PUT") {
      const id = pathname.replace("/api/expenses/", "");
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

      if (!item) {
        return new Response(
          JSON.stringify({ success: false, message: "Item description cannot be empty." }),
          { status: 400, headers: responseHeaders }
        );
      }
      if (isNaN(amount) || amount <= 0) {
        return new Response(
          JSON.stringify({ success: false, message: "Amount must be greater than zero." }),
          { status: 400, headers: responseHeaders }
        );
      }

      ledger.expenses[index] = {
        ...ledger.expenses[index],
        date: (body.date || ledger.expenses[index].date).trim(),
        item,
        category: (body.category || ledger.expenses[index].category).trim(),
        amount,
        paidBy: (body.paidBy || ledger.expenses[index].paidBy).trim(),
        notes: (body.notes !== undefined ? body.notes : ledger.expenses[index].notes).trim()
      };
      ledger.updatedAt = new Date().toISOString();
      await store.setJSON("ledger_data", ledger);

      return new Response(JSON.stringify(ledger), { status: 200, headers: responseHeaders });
    }

    // 6. DELETE /api/expenses/:id - Delete expense
    if (pathname.startsWith("/api/expenses/") && method === "DELETE") {
      const id = pathname.replace("/api/expenses/", "");
      const initialLength = ledger.expenses.length;
      ledger.expenses = ledger.expenses.filter((e) => e.id !== id);

      if (ledger.expenses.length === initialLength) {
        return new Response(
          JSON.stringify({ success: false, message: "Expense not found." }),
          { status: 404, headers: responseHeaders }
        );
      }

      ledger.updatedAt = new Date().toISOString();
      await store.setJSON("ledger_data", ledger);

      return new Response(JSON.stringify(ledger), { status: 200, headers: responseHeaders });
    }

    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404,
      headers: responseHeaders
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: responseHeaders }
    );
  }
};
