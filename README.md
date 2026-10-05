# Finance Planner

A local-first personal finance app. Track expenses, paycheck deductions, investment contributions, and project portfolio growth — all stored in a plain JSON file on your machine that never leaves it.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (or use [nvm](https://github.com/nvm-sh/nvm))
- npm (bundled with Node)

## Getting started

```bash
# 1. Clone the repo
git clone <repo-url>
cd finance-planner

# 2. Install dependencies (root + frontend)
npm install
npm install --prefix app

# 3. Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

`npm run dev` starts two processes concurrently:
- **Express backend** on port 3001 — reads and writes `finance-data.json`
- **Vite frontend** on port 5173 — the React UI, proxies `/api` to the backend

## Your data

All data is stored in `finance-data.json` at the project root. This file is **gitignored** — it will never be committed, so it stays on your machine only.

On first run the file is created automatically with an empty state. You can also **import** an existing `finance-data.json` via the Import JSON button in the top-right corner of the app.

To back up your data, just copy `finance-data.json` somewhere safe.

## Project structure

```
finance-planner/
├── server.cjs          # Express API (read/write finance-data.json)
├── finance-data.json   # Your data — gitignored, created on first run
├── FORMULAS.md         # Reference for all calculation logic
└── app/                # Vite + React + TypeScript frontend
    └── src/
        ├── types.ts
        ├── calculations.ts
        └── components/
```

## Tabs

| Tab | What it does |
|-----|-------------|
| **Expenses** | Recurring expenses at any frequency — weekly, bi-weekly, monthly, quarterly, annually, and more. Flags for tax withholding and necessary vs. discretionary. |
| **Contributions** | Monthly investment contributions (401k, Roth, HSA, etc.) with pre-tax and employer match flags. |
| **Income & Summary** | Full income waterfall from gross salary to surplus, shown monthly and per-paycheck. |
| **Investments** | Portfolio holdings by category, future value projection based on your age, retirement age, and return assumptions. |

## Calculation reference

See [FORMULAS.md](FORMULAS.md) for a full explanation of how frequency conversions, the income waterfall, and portfolio projections are calculated.

## Building for production

```bash
npm run build
```

The compiled frontend lands in `app/dist/`. You can serve it alongside `server.cjs` with any static file server.
