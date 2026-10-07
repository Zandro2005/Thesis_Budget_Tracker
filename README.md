# Thesis Budget & Expense Tracker (₱15,000 Target)

A transparent, real-time budgeting web app built for academic thesis & capstone groups. Designed to maximize a **₱15,000 PHP** thesis budget with financial clarity for all members and an admin-protected ledger for the treasurer.

Hosted on **Netlify** with **Netlify Functions** and **Netlify Blobs** for zero-maintenance live persistence.

---

## Features

- **Public Transparency Link**: Members can view current spending, category breakdown, and remaining budget anytime without creating accounts or passwords.
- **Admin Password Protected**: Only the treasurer / team lead can add, edit, or delete expenses and adjust the budget cap.
- **Real-Time Budget Impact Preview**: When adding an expense, the app calculates projected remaining balance and warns if an item risks pushing the group over the ₱15,000 limit.
- **Mobile-First Responsive UI**:
  - Desktop: Full structured table with sortable columns and category badges.
  - Mobile (<768px): Automatically morphs into touch-friendly cards, sticky remaining-balance glance bar, and bottom-sheet drawer forms.
- **Category Filter Chips**: Fast horizontally-swipeable filters for Printing & Binding, Materials, Transportation, Food, Software, Survey Tokens, and Miscellaneous.
- **Live Search & Sort**: Find items by purpose, payer, date, or amount.
- **Export to CSV**: 1-click export of the entire ledger for your thesis defense documentation and financial appendix.

---

## Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run local dev server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.
   > The local development server includes built-in API emulation, saving data to `.data/ledger.json` automatically.

3. **Default Admin Password**:
   - Password: `0907133ado`

---

## Deploying to Netlify (Free Hosting)

### Method 1: Via GitHub (Recommended for automatic updates)
1. Push this project to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of thesis budgeting app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. Go to [Netlify.com](https://app.netlify.com) and log in.
3. Click **Add new site** → **Import an existing project** → Select **GitHub**.
4. Pick your thesis budget repository.
   - Build command: `npm run build`
   - Publish directory: `dist`
   - (Netlify automatically picks these up from `netlify.toml`)
5. Click **Add environment variables** and set:
   - Key: `ADMIN_PASSWORD`
   - Value: `<your-secret-group-treasurer-password>`
6. Click **Deploy thesis-budget-tracker**.
7. Share the generated `https://<your-site-name>.netlify.app` URL with your thesis group members!

### Method 2: Via Netlify CLI
1. Run:
   ```bash
   npx netlify login
   npx netlify deploy --build --prod
   ```
2. In the Netlify dashboard under **Site configuration → Environment variables**, add `ADMIN_PASSWORD`.

---

## Tech Stack
- **Frontend**: Vanilla JavaScript (ES Modules), Modern CSS with Glassmorphism, Google Fonts (`Outfit`, `Inter`).
- **Dev Tooling**: [Vite](https://vitejs.dev/)
- **Serverless Backend**: [Netlify Functions](https://docs.netlify.com/functions/overview/) (v2)
- **Database/Storage**: [Netlify Blobs](https://docs.netlify.com/blobs/overview/)
