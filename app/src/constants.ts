export const EXPENSE_CATEGORIES = [
  'Automotive',
  'Bills & Utilities',
  'Entertainment',
  'Fees & Adjustments',
  'Food & Drink',
  'Gas',
  'Gifts & Donations',
  'Groceries',
  'Health & Wellness',
  'Home',
  'Personal',
  'Professional Services',
  'Shopping',
  'Travel',
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]
