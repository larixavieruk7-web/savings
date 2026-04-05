/* One-off: parse local CSV downloads and emit SQL INSERTs for Supabase. */
import fs from 'fs';
import path from 'path';
import { parseNatWestCSV } from '../src/lib/csv/natwest';
import { parseAmexCSV } from '../src/lib/csv/amex';

const USER_ID = 'd2dcfc0d-80b1-495f-871b-f29bdf902f8c';
const CSV_DIR = 'C:\\Users\\Family\\Downloads\\csv_downloads';

const NATWEST_FILES = [
  'NatWest-download-20260405.csv',
];
// Amex files with Card Member + Account # columns populated — parser auto-routes.
const AMEX_FILES = [
  'gus_amex_mar.csv',
  'gus_amex_recent.csv',
  'amex_1002_mar.csv',
  'amex_1002_recent.csv',
];
// Single-card Amex exports missing the Card Member / Account # columns.
// Larissa's standalone Amex online account holds card -71010.
const AMEX_SINGLE_CARD_FILES: Array<{ file: string; memberName: string; accountNum: string }> = [
  { file: 'lari_amex_mar.csv',    memberName: 'LARISSA', accountNum: '-71010' },
  { file: 'lari_amex_recent.csv', memberName: 'LARISSA', accountNum: '-71010' },
];

const rows: any[] = [];

for (const f of NATWEST_FILES) {
  const p = path.join(CSV_DIR, f);
  if (!fs.existsSync(p)) { console.error('missing', p); continue; }
  const csv = fs.readFileSync(p, 'utf-8');
  const { transactions, errors } = parseNatWestCSV(csv);
  console.error(`${f}: ${transactions.length} txns, ${errors.length} errors`);
  rows.push(...transactions);
}

for (const f of AMEX_FILES) {
  const p = path.join(CSV_DIR, f);
  if (!fs.existsSync(p)) { console.error('missing', p); continue; }
  const csv = fs.readFileSync(p, 'utf-8');
  const { transactions, errors } = parseAmexCSV(csv);
  console.error(`${f}: ${transactions.length} txns, ${errors.length} errors`);
  rows.push(...transactions);
}

for (const { file, memberName, accountNum } of AMEX_SINGLE_CARD_FILES) {
  const p = path.join(CSV_DIR, file);
  if (!fs.existsSync(p)) { console.error('missing', p); continue; }
  const csv = fs.readFileSync(p, 'utf-8');
  const { transactions, errors } = parseAmexCSV(csv, [], { memberName, accountNum });
  console.error(`${file}: ${transactions.length} txns (hint ${memberName} ${accountNum}), ${errors.length} errors`);
  rows.push(...transactions);
}

const esc = (s: unknown) => "'" + String(s ?? '').replace(/'/g, "''") + "'";
const num = (n: unknown) => String(Number(n) || 0);
const bool = (b: unknown) => (b ? 'true' : 'false');

const values = rows.map((t: any) => `(${[
  esc(t.id),
  esc(USER_ID),
  esc(t.date),
  esc(t.type ?? ''),
  esc(t.description ?? ''),
  esc(t.rawDescription ?? ''),
  num(t.amount),
  num(t.balance),
  esc(t.category ?? 'Other'),
  t.subcategory ? esc(t.subcategory) : 'NULL',
  t.merchantName ? esc(t.merchantName) : 'NULL',
  bool(t.isRecurring),
  bool(t.isEssential ?? false),
  esc(t.accountName ?? ''),
  esc(t.source),
  esc(t.categorySource ?? 'rule'),
].join(',')})`).join(',\n');

const sql = `INSERT INTO transactions (id, user_id, date, type, description, raw_description, amount, balance, category, subcategory, merchant_name, is_recurring, is_essential, account_name, source, category_source) VALUES\n${values}\nON CONFLICT (id) DO NOTHING;`;

fs.writeFileSync('scripts/tmp-import.sql', sql);
console.error(`\nGenerated ${rows.length} rows → scripts/tmp-import.sql`);
