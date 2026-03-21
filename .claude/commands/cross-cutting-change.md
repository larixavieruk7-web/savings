You are about to make a cross-cutting change — something that affects shared values used in multiple places (category names, localStorage key names, display formats, amount conventions, date formats).

Follow this protocol exactly:

1. **GREP FIRST** — Before editing any file, grep the entire codebase for every affected pattern. Build a complete inventory of every file and line number.

2. **AUDIT SYSTEMATICALLY** — Check all of:
   - `src/lib/categories.ts` — category names and colors (source of truth)
   - `src/lib/storage.ts` — localStorage key names (source of truth)
   - `src/lib/utils.ts` — shared formatting functions
   - All pages in `src/app/` that import the changed module
   - All hooks and context files
   - `src/types/index.ts` — type definitions

3. **ONE PASS** — Fix everything from the inventory in a single pass. Do not make partial changes.

4. **VERIFY** — Re-grep to confirm zero remaining instances of old patterns.

5. **UPDATE CLAUDE.md** — If the change affects a pattern documented in any `CLAUDE.md` file, update it in the same commit.
