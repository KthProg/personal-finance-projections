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
        ├── constants.ts
        └── components/
```

## AI Assistant

A floating chat button (✦) in the bottom-right corner opens an AI assistant powered by Claude. It has full read access to your financial snapshot — salary, expenses, contributions, holdings, and retirement projection — and can answer questions, flag concerns, or suggest trade-offs based on your actual numbers.

To enable it:

1. Get a Claude API key from [console.anthropic.com](https://console.anthropic.com) → API Keys (or request one from your org admin if you're on an enterprise account)
2. Open ⚙ Settings in the app and paste the key into the **Claude API key** field
3. Click **Save** — the ✦ button will activate

The key is stored in `config.json` on your machine and is never sent anywhere except directly to the Anthropic API. Responses stream in token by token.

## Tabs

| Tab | What it does |
|-----|-------------|
| **Expenses** | Recurring expenses at any frequency — weekly, bi-weekly, monthly, quarterly, annually, and more. Assign an expense category to each item to enable direct comparison against imported transactions. Flags for tax withholding and necessary vs. discretionary. |
| **Contributions** | Monthly investment contributions (401k, Roth, HSA, etc.) with pre-tax and employer match flags. |
| **Income & Summary** | Full income waterfall from gross salary to surplus, shown monthly and per-paycheck. |
| **Budgeting** | Import Chase CSV exports (select multiple files at once) to compare actual spending against your budget by category. Payments, loan payments, and investment transfers are automatically excluded. Transactions are deduplicated across imports so overlapping date ranges are safe to re-import. |
| **Investments** | Portfolio holdings by category, future value projection based on your age, retirement age, and return assumptions. Uses the 4% rule to estimate monthly retirement income. |

## Budgeting tab — how it works

1. Download your activity CSV from Chase (Accounts → Download account activity)
2. Click **Import CSV** in the Budgeting tab and select one or more CSV files
3. Tag your expenses in the Expenses tab with an expense category (the same categories Chase uses) to see a side-by-side comparison
4. Actual spending is prorated against your monthly budget based on the date range of your transactions

## Calculation reference

See [FORMULAS.md](FORMULAS.md) for a full explanation of how frequency conversions, the income waterfall, and portfolio projections are calculated.

## Building for production

```bash
npm run build
```

The compiled frontend lands in `app/dist/`. You can serve it alongside `server.cjs` with any static file server.
