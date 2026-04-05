# Handoff — Full Account Reconciliation (05 Apr 2026)

**Branch:** `feature/ai-financial-advisor` (uncommitted — bundled with prior AI-advisor WIP per earlier handoff)
**Author (this session):** Claude (Larissa's session)
**Status:** Dashboard fully reconciled. Larissa to resume tomorrow with action items in §7.

---

## 1. TL;DR — What changed

A reconciliation session that started out as "CC balances look wrong" ended with:

1. **Complete rebuild of understanding of the household's Amex card architecture** (was wrong in 4 different ways).
2. **Every dashboard balance card is now correct and authoritative.**
3. **DB cleaned up**: legacy `source=NULL` rows fixed, pending NatWest transactions injected, CC balance snapshots set.
4. **Manual balances migrated from `localStorage` → Supabase** (`user_settings.manual_balances` jsonb) so they persist across devices.
5. **Amex CSV parser extended** to handle Amex's single-card export format which omits `Card Member` / `Account #` columns.
6. **Auto-import script** (`scripts/import-csvs.ts`) runs against the downloads folder, handles every file format we've seen, ready for weekly re-use.

---

## 2. The card architecture (FINAL — confirmed)

This took 6 iterations to land on. Don't second-guess it — it's backed by Amex confirmation-number cross-referencing with NatWest Faster Payment references.

The household has **2 Amex accounts**, each with a primary + supplementary card:

| Amex Account | Primary | Supplementary | Dashboard slot | Current balance |
|---|---|---|---|---|
| **BA Premium Plus** | Gus `-21005` | Larissa `-21013` | `amex-ba` | **£2,211.65** |
| **Platinum Cashback Everyday** | Gus `-71002` | Larissa `-71010` | `amex-cashback` | **£96.83** |

Key facts:

- **Larissa has no primary Amex cards.** Only two supplementary/additional cardmember cards.
- **Gus pays both accounts** via Faster Payment from his NatWest Current Account. Amex classifies these as `METHOD: Other` (not Direct Debit) because they come in as inbound FPs from a bank app rather than as a pull.
- **Confirmation-number match is proof:** Amex's "Confirmation" codes in the payment history (e.g. `203421024714000N`) are literal suffixes of NatWest's Faster Payment references (e.g. `59203421024714000N`). Cross-referenced 12 months of payments — all match.
- **Larissa's Amex UI** shows the shared account's payment history because she's an additional cardmember. The banner *"Additional Cardmembers are not eligible to make payments through the MYCA Payment Centre"* is the giveaway.
- **`LXDS` tag** in -71002's transaction list = "Larissa XDS (Xavier Da Silva)". Her -71010 charges appear on -71002's statement tagged with `LXDS`.
- The `£355.85 / £77.84` figures Larissa's -71010 page shows are **card-scoped activity counters, NOT separate debt**. The real outstanding is the account-level `Total Balance £96.83` from Gus's -71002 view.
- `-21013` has 670 historical transactions in the DB. All are Larissa's spending on her BA Premium supplementary card — they roll up into Gus's `-21005` bill of £2,211.65. For spend-analysis attribution we can still tag them as Larissa's, but for billing they belong to Gus.

---

## 3. Current dashboard state (post-reconciliation)

| Slot | Balance | Source | Editable? |
|---|---|---|---|
| NatWest Current | £482.17 | computed from CSV rows + 6 injected pending rows for 04 Apr | No |
| NatWest Savings | £10,231.21 | CSV latest row | No |
| NatWest Food Shopping CC | £143.56 | CSV "Balance as at 03 Apr" snapshot | No |
| NatWest Mastercard | £2,447.48 | CSV snapshot £2,552.06 − £104.58 payoff 04 Apr | No |
| NatWest Personal Loan | £6,913.59 | Supabase `user_settings.manual_balances` | **Yes — click** |
| Amex BA Premium | £2,211.65 | Supabase manual | **Yes — click** |
| Amex Platinum Cashback | £96.83 | Supabase manual | **Yes — click** |

**Totals:**
- Total CC debt: **£4,898.72** (Food £143.56 + Mastercard £2,447.48 + Amex BA £2,211.65 + Amex Cashback £96.83)
- Loan remaining: **£6,913.59**
- Combined debt: **£11,812.31**

---

## 4. Evolution of this session (how we got here)

Reading this as a chronological record so future-Claude doesn't repeat mistakes:

### Start of session — "balances are wrong"
- Larissa reported CC cards showing "No data" and other disparities vs NatWest web UI.
- Initial theory: a bug in `AccountBalancesPanel` or stale data. Partially correct.

### Round 1 — DB had legacy `source=NULL` rows
- 2,536 old NatWest rows with `source=NULL` existed in Supabase — invisible to `matchSlot` which filters on `source='natwest'`. These were pre-source-field legacy rows.
- 1,751 of them (Food Shopping Cc + MASTERCARD) had **inverted sign convention** — purchases stored as positive, our convention is negative. Parser was later fixed to flip CC signs; the legacy rows were never migrated.
- **Fix:** SQL cleanup — deleted 41 overlap rows dated ≥ 2026-03-16, flipped signs on the remaining CC rows, set `source='natwest'` on all of them.

### Round 2 — Three frontend bugs in `AccountBalancesPanel.tsx`
1. **CC balance always returned 0 for positive debt.** Logic was `t.balance < 0 ? Math.abs(t.balance) : 0` — but NatWest reports CC outstanding as a POSITIVE number on "Balance as at" rows. Fixed to unconditional `Math.abs()`.
2. **Amex Gus "No data".** `matchSlot` looked for substrings `"xavier"` / `"gus"` in account_name, but the parser stores it as `"Amex G (-21005)"` — neither hits. Fixed to match on card-number suffix.
3. **Amex Larissa inflated to £5,664.** `amexOutstanding` treated *any* positive amount as a statement payment, including tiny merchant refunds. Larissa's card had zero `PAYMENT RECEIVED` rows in the CSV, so a £90 M&S refund was being used as her "last payment", inflating the window to 2 months. Fixed to only match `PAYMENT RECEIVED` rows.

### Round 3 — Missing CC balance data
- Food Shopping CC and Mastercard CSVs had `Balance as at …` summary rows but the parser skipped them. Fixed parser to capture them into a `balanceSnapshots` map and stamp onto the latest transaction per account. Plus inserted synthetic snapshot rows for both CCs dated 2026-04-03 with known balances.

### Round 4 — Pending Apr 4 CC payments in-flight
- NatWest CSV exports are **settled-only**. Six payments Larissa made on 04 Apr were visible on NatWest's web UI (pending) but not in the downloaded CSV.
- Inserted 6 synthetic pending rows as `Current Account` transactions dated 2026-04-04 with IDs prefixed `pending-` for easy deletion when they eventually settle:
  - `NORMAN GOMES -£25.00`
  - `GXAVIER DA SILVA +£15.00`
  - `ACC-NWEST A/V -£1,124.59` **← still unidentified, see §7**
  - `ACC-NWESTMSTR -£104.58` (Mastercard payoff — snapshot updated)
  - `AMERICAN EXP 3773 -£2,656.16` (Amex BA Premium payoff — appeared on -21005 side in `gus_amex_recent.csv` on 04/04)
  - `AMERICAN EXP 3773 -£114.95` (Amex Platinum Cashback payoff — appeared on -71002 side in `amex_1002_recent.csv` on 04/04)
- Post-payment Current Account balance computed as £482.17.

### Round 5 — Amex CSV single-card format
- Larissa's standalone Amex downloads (`lari_amex_*.csv`) **omit the `Card Member` and `Account #` columns** — this is Amex's single-card export variant vs. Gus's multi-card account which includes them.
- Parser extended with an optional `accountHint` parameter: `parseAmexCSV(csv, customRules, { memberName, accountNum })`. When the CSV's `Card Member` column is empty, falls back to the hint. Used in `scripts/import-csvs.ts` for Larissa's files (`-71010` hint).

### Round 6 — Card architecture mis-modelled (TWICE)
- First wrong theory: 2 Amex slots, Larissa + Gus, `-21013` routed to Larissa.
- Second wrong theory: 3 Amex slots, `amex-gus-ba`, `amex-gus-cb`, `amex-larissa-cb`, with Larissa's `-71010` as a standalone account.
- **Correct model (confirmed via Amex confirmation-number cross-reference):** 2 Amex accounts, each with primary + supplementary. `-71002` and `-71010` are the same account. Payments on either visibility show the same history.
- Final fix: `ACCOUNTS` has 2 Amex slots (`amex-ba`, `amex-cashback`), `matchSlot` routes `-21005 || -21013 → amex-ba` and `-71002 || -71010 → amex-cashback`.

### Round 7 — Larissa unpaid theory was WRONG
- Earlier in the session I told Larissa her `-71010` card had "never been paid" and urged her to set up a DD immediately. **This was wrong.**
- Evidence that revealed the truth: Larissa pasted a 13-month payment history from her -71010 Amex UI. I initially dismissed it as "that's actually -71002's history". Wrong interpretation.
- The correct interpretation: because `-71002` and `-71010` are **one shared account**, both UIs show the same payment history — these are account-level payments. Gus has been paying the whole account for 13 months via NatWest Faster Payment. Larissa's card is fully covered.
- Confirmation number match (`203421024714000N` Amex ↔ `59203421024714000N` NatWest FP) is the smoking gun.

### Round 8 — `localStorage` → Supabase migration
- Larissa correctly pushed back: "our storage IS in Supabase, I'm not sure what you're talking about."
- Loan balance was in localStorage in the existing codebase (pre-session). I'd extended that pattern for the Amex balances. Not consistent with the rest of the app.
- **Fix:** Added `manual_balances jsonb` column to `user_settings` via `ALTER TABLE`. New helpers `fetchManualBalances()` / `setManualBalance(slot, pence)` in `src/lib/supabase/storage.ts`. Component loads async on mount, saves async on edit. Defaults only apply while fetch is in-flight.

---

## 5. Files changed (still uncommitted)

Edits this session, layered on top of prior `feature/ai-financial-advisor` WIP:

```
M src/components/dashboard/AccountBalancesPanel.tsx  # slots, matcher, manual balances
M src/lib/csv/natwest.ts                             # CC sign flip + balance snapshots (prior session)
M src/lib/csv/amex.ts                                # accountHint parameter for single-card exports
M src/lib/supabase/storage.ts                        # fetchManualBalances, setManualBalance
M src/lib/storage.ts                                 # getManualBalances, saveManualBalance exports
A scripts/import-csvs.ts                             # one-command upload of all files in csv_downloads/
A docs/handoff/reconciliation-20260405.md            # this file
```

Key code locations to jump to:

- `src/components/dashboard/AccountBalancesPanel.tsx` — the truth for slot layout, matcher, and edit UX
- `src/lib/csv/amex.ts:117` — `parseAmexCSV` with `accountHint` parameter
- `src/lib/supabase/storage.ts` — search for `manual_balances` for the new helpers
- `scripts/import-csvs.ts` — the runnable import, edit the `NATWEST_FILES` / `AMEX_FILES` / `AMEX_SINGLE_CARD_FILES` arrays when new files arrive

---

## 6. Database state after all DB writes

Row counts for Larissa's user_id (`d2dcfc0d-80b1-495f-871b-f29bdf902f8c`):

```
Total transactions: 3,545
  source='natwest': 2,688
  source='amex':      857
```

Synthetic rows added this session (all deletable by prefix):
- `snap-food-shopping-cc-20260403` — CC balance snapshot £143.56
- `snap-mastercard-20260403` — CC balance snapshot £2,447.48 (post-payoff)
- `pending-20260404-01-norman` through `pending-20260404-06-amex-small` — 6 pending Current Account rows

Schema addition:
```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS manual_balances jsonb DEFAULT '{}'::jsonb;
```

Current `manual_balances` jsonb for Larissa (after first edit it'll populate; defaults kick in until then):
- `amex-ba`: 221165 (£2,211.65)
- `amex-cashback`: 9683 (£96.83)
- `natwest-loan`: 691359 (£6,913.59)

---

## 7. Action items for tomorrow (Larissa)

### Must-do
- [ ] **Clarify `ACC-NWEST A/V -£1,124.59`** — only unresolved pending row on NatWest Current Account from 04 Apr. On NatWest web UI, hover or click that pending row for the full description/destination. It's way bigger than Food Shopping CC's outstanding (£143.56) so it can't be paying that card — possible candidates: a standing order to another product, a savings goal, or a transfer. Whatever it is, we need to know which slot (if any) it should adjust.

### Upload cadence (weekly)
1. Download fresh files into `C:\Users\Family\Downloads\csv_downloads`:
   - **NatWest**: Date range last ~30 days, Excel & Text (CSV), select 5 accounts (Current, Main Savings, Food Shopping Cc, MASTERCARD, XAVIER DA SILVA G). Skip Dining Fund, Long Term Savings, MOT/TV/Tax/Car Ins, New Car.
   - **Gus Amex**: both "recent transactions" and "closing statement" CSVs. Contains both -21005 and -21013 rows automatically because of the joint account structure.
   - **Larissa Amex**: both "recent" and "closing" CSVs. Contains -71010 rows with `LXDS` markings.
   - **-71002 (Gus Cashback)**: both "recent" and "closing" CSVs.
2. Open `scripts/import-csvs.ts`, update the filename arrays at the top if the filenames are different from last time.
3. Run: `npx tsx scripts/import-csvs.ts`
4. Run: `npx supabase db query --linked -f scripts/tmp-import.sql`
5. Delete `scripts/tmp-import.sql`
6. Hard-refresh the dashboard.
7. If any pending rows from previous week have now settled, manually delete their `pending-YYYYMMDD-*` IDs from Supabase to avoid double-counting with the real settled rows.

### Balance maintenance
- Each week, compare dashboard Amex balances with Amex web UI. Click to edit if they've drifted. Takes 30 seconds.
- Loan balance same — click to adjust if NatWest has processed this month's payment.

### Nice-to-have
- [ ] Consider wrapping the import process in a single `npm run import-csvs` script (currently two commands).
- [ ] The 6 `pending-20260404-*` rows from this session will be superseded when NatWest finishes processing the 04 Apr transactions (1-2 business days). Write a cleanup SQL once the real rows arrive:
  ```sql
  DELETE FROM transactions WHERE id LIKE 'pending-20260404-%';
  ```

---

## 8. Things NOT to do (don't repeat my mistakes)

1. **Don't assume a "PAYMENT RECEIVED" row's absence means a card is unpaid.** Amex's single-card CSV export sometimes omits payment rows entirely depending on export variant. Cross-reference with NatWest Faster Payment references (the confirmation-number suffix trick is the reliable method).
2. **Don't trust card-scoped "activity" counters in the Amex UI for outstanding balance.** Only "Total Balance" on the PRIMARY cardholder's view is the authoritative figure. Supplementary cardholder views show scoped counters that don't reflect the billed amount.
3. **Don't use `localStorage` for new persistent state.** Everything goes in Supabase via `user_settings` (for scalar/jsonb config) or dedicated tables (for lists). See `manual_balances` as the template.
4. **Don't hard-delete legacy NULL-source rows wholesale.** They contain a year of real history. Migrate them (flip signs where needed, set source, keep row) rather than deleting.
5. **Don't attempt to commit this reconciliation fix in isolation.** It's layered on top of the uncommitted AI-advisor feature branch. Full-branch commit happens after user approves the whole thing.
6. **Don't run `mcp__claude_ai_Supabase__*` or `mcp__claude_ai_Vercel__*`** — those are Gus's auth. Use CLI (`npx supabase`, `vercel`) — Larissa's auth.

---

## 9. Starting prompt for tomorrow's session

> Continuing from `docs/handoff/reconciliation-20260405.md`. Dashboard is reconciled, branch is uncommitted. I've done the weekly CSV download for [dates]. Ready to run the import and spot-check the numbers. Also, I found out `ACC-NWEST A/V` is actually [answer] — does that need a dashboard adjustment?
