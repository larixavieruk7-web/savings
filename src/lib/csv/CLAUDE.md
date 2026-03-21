# CSV Parsers

## HARD GATE: Amex Sign Convention
Amex `Amount` column is **POSITIVE for charges** (opposite to our convention).
The parser MUST flip: `amount = parsedAmount * -1`.
NatWest `Value` is already signed correctly (negative = outflow). Do NOT flip it.

## NatWest Format
- Columns: `Date, Type, Description, Value, Balance, Account Name, Account Number`
- Date format: `dd MMMM yyyy` (e.g. "29 May 2025") — use date-fns `parse` with this format
- Single CSV may contain multiple accounts — group by `Account Number`
- Transaction type codes: `DPC` (transfers), `INT` (interest), `D/D` (direct debit), `BAC` (salary), `CHG` (charges), `TFR` (transfer), `C/L` (cash)

## NatWest Merchant Rules (real data — keep these)
| Pattern | Category |
|---------|----------|
| `XAVIER DA SILVA G` | Salary |
| `DPC To/From A/C` | Transfers |
| `ROUND UP FROM` | Savings & Investments |
| `INTER BON` | Income |
| `NON-STERLING TRANSACTION` | Bank Charges |
| `NATWEST LOAN` | Debt Repayments |
| `OCTOPUS ENERGY` | Utilities |
| `BRISTOLWESSEXWATER` | Utilities |
| `BCP COUNCIL` | Utilities |
| `MYREWARDS` | Income |
| `FASTER PAYMENT RECEIVED` | Income |

## Amex Format
- Columns: `Date, Description, Card Member, Account #, Amount, Extended Details, Appears On Your Statement As, Address, Town/City, Postcode, Country, Reference, Category`
- Date format: `DD/MM/YYYY`
- `Card Member` field identifies Larissa (`MRS LARISSA DA SILVA`) vs Gus (`G XAVIER DA SILVA`)
- `Category` field contains Amex pre-categorization (e.g. `Entertainment-Restaurants`) — map to our taxonomy
- Multi-line descriptions appear in quoted fields — PapaParse handles this automatically

## Transaction ID
Include account number in the ID for dedup: `${accountNumber}_${date}_${description}_${amount}`
