import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

function localApiDevPlugin() {
  const dataDir = path.resolve(process.cwd(), "data");
  const dataFile = path.join(dataDir, "ledger.json");

  const defaultData = {
    totalBudget: 15000,
    currency: "PHP",
    title: "Thesis Capstone Budget",
    updatedAt: new Date().toISOString(),
    expenses: [
      {
        id: "demo-1",
        date: "2026-10-01",
        item: "Survey Questionnaires Pilot Print (50 sets)",
        category: "Printing & Binding",
        amount: 450,
        paidBy: "Team Lead",
        notes: "Initial pilot test copies"
      },
      {
        id: "demo-2",
        date: "2026-10-03",
        item: "Prototype Components & Sensors",
        category: "Materials & Supplies",
        amount: 1850,
        paidBy: "Hardware Lead",
        notes: "Microcontroller, wiring & sensors"
      },
      {
        id: "demo-3",
        date: "2026-10-05",
        item: "Field Research Transportation Fare",
        category: "Transportation",
        amount: 620,
        paidBy: "All Members",
        notes: "Site visit and interviews"
      }
    ]
  };

  function readData() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(dataFile)) {
      fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2), "utf-8");
      return defaultData;
    }
    try {
      const raw = fs.readFileSync(dataFile, "utf-8");
      return JSON.parse(raw);
    } catch {
      return defaultData;
    }
  }

  function writeData(data) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf-8");
  }

  return {
    name: "local-api-dev-middleware",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith("/api/")) {
          return next();
        }

        const url = new URL(req.url, "http://localhost:5173");
        const pathname = url.pathname;
        const method = req.method.toUpperCase();

        const sendJson = (status, obj) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
        };

        const checkAuth = () => {
          const expected = process.env.ADMIN_PASSWORD || "0907133ado";
          const header = req.headers["x-admin-password"];
          return header === expected;
        };

        // Parse JSON body helper
        const parseBody = () =>
          new Promise((resolve) => {
            let bodyStr = "";
            req.on("data", (chunk) => {
              bodyStr += chunk;
            });
            req.on("end", () => {
              try {
                resolve(JSON.parse(bodyStr || "{}"));
              } catch {
                resolve({});
              }
            });
          });

        (async () => {
          const ledger = readData();

          if (pathname === "/api/ledger" && method === "GET") {
            return sendJson(200, ledger);
          }

          if (pathname === "/api/auth" && method === "POST") {
            if (checkAuth()) {
              return sendJson(200, { success: true, message: "Authenticated" });
            }
            return sendJson(401, { success: false, message: "Invalid admin password" });
          }

          // Protected endpoints
          if (!checkAuth()) {
            return sendJson(401, { success: false, message: "Unauthorized. Admin password required." });
          }

          if (
            (pathname === "/api/sync" && method === "POST") ||
            (pathname === "/api/ledger" && method === "PUT")
          ) {
            const body = await parseBody();
            if (body && Array.isArray(body.expenses)) {
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
              writeData(ledger);
              return sendJson(200, ledger);
            }
          }

          if (pathname === "/api/budget" && method === "PUT") {
            const body = await parseBody();
            if (typeof body.totalBudget === "number" && body.totalBudget > 0) {
              ledger.totalBudget = body.totalBudget;
            }
            if (typeof body.title === "string" && body.title.trim()) {
              ledger.title = body.title.trim();
            }
            ledger.updatedAt = new Date().toISOString();
            writeData(ledger);
            return sendJson(200, ledger);
          }

          if (pathname === "/api/expenses" && method === "POST") {
            const body = await parseBody();
            const amount = parseFloat(body.amount);
            const item = (body.item || "").trim();
            if (!item || isNaN(amount) || amount <= 0) {
              return sendJson(400, { success: false, message: "Invalid item or amount." });
            }
            const id = String(body.id || ("exp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)));
            const newExp = {
              id,
              date: (body.date || new Date().toISOString().split("T")[0]).trim(),
              item,
              category: (body.category || "Miscellaneous").trim(),
              amount,
              paidBy: (body.paidBy || "Unspecified").trim(),
              notes: (body.notes || "").trim()
            };

            const existingIdx = (ledger.expenses || []).findIndex((e) => String(e.id) === id);
            if (existingIdx !== -1) {
              ledger.expenses[existingIdx] = newExp;
            } else {
              ledger.expenses.unshift(newExp);
            }

            ledger.updatedAt = new Date().toISOString();
            writeData(ledger);
            return sendJson(201, ledger);
          }

          if (pathname.startsWith("/api/expenses/") && method === "PUT") {
            const id = pathname.replace("/api/expenses/", "");
            const index = (ledger.expenses || []).findIndex((e) => String(e.id) === String(id));
            if (index === -1) {
              return sendJson(404, { success: false, message: "Expense not found." });
            }
            const body = await parseBody();
            const amount = parseFloat(body.amount);
            const item = (body.item || "").trim();
            if (!item || isNaN(amount) || amount <= 0) {
              return sendJson(400, { success: false, message: "Invalid item or amount." });
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
            writeData(ledger);
            return sendJson(200, ledger);
          }

          if (pathname.startsWith("/api/expenses/") && method === "DELETE") {
            const id = pathname.replace("/api/expenses/", "");
            ledger.expenses = (ledger.expenses || []).filter((e) => String(e.id) !== String(id));
            ledger.updatedAt = new Date().toISOString();
            writeData(ledger);
            return sendJson(200, ledger);
          }

          return sendJson(404, { success: false, message: "Not found" });
        })();
      });
    }
  };
}

export default defineConfig({
  plugins: [localApiDevPlugin()],
  server: {
    port: 5173,
    host: true
  }
});
