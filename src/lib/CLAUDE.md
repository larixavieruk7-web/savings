# src/lib — Storage & Business Logic

## Storage: 3-Layer Architecture
```
Pages/Hooks → storage.ts (async orchestrator) → supabase/storage.ts (primary)
                                               → storage-local.ts (cache fallback)
```
- `storage.ts` tries Supabase first, updates localStorage cache on success, falls back on failure
- `getDisplayName()` is synchronous (cache only) — exception to async pattern
- `supabase/migration.ts` — one-time localStorage→Supabase upload, gated in layout-shell.tsx

## Categorization Pipeline (priority order — never skip)
1. Custom/user rules (corrections, matched by description substring)
2. Keyword rules (100+ patterns in `categories.ts`)
3. Amex category mapping (30+ pre-categories)
4. GPT-4o batch (150 tx/call via `/api/categorize/`)
5. Manual correction (user clicks category badge)

## Gotchas
- Amounts are integers (pence) — `storage.ts` converts on read/write
- `categories.ts` is source of truth for category names/colors — add new categories there first
- Custom rules persist forever — one correction fixes all matching past/future transactions
- Account hierarchy must be set before money-flow calculations
- Category creep needs 4+ salary cycles (3 historical + 1 current)
