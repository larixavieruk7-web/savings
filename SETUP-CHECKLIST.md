# Setup Checklist — Larissa's PC

All steps completed on 2026-03-24 unless noted otherwise.

---

## 0. Voice Input + Agent Teams + Effort Level — DONE
- [x] `voiceEnabled: true` in global settings.json
- [x] `AUDIODRIVER=waveaudio` env var
- [x] `effortLevel: "high"`
- [x] `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- [x] Keybinding `=` → `voice:pushToTalk` (keybindings.json created)

## 1. Claude Code Plugins — DONE
- [x] `/install-plugin superpowers`
- [x] `/install-plugin skill-creator`
- [x] `/install-plugin frontend-design`

## 2. CLI Tools — DONE
- [x] yt-dlp (2026.03.17)
- [x] Python (3.12.10)
- [x] NotebookLM CLI (notebooklm-py)
- [x] edge-tts
- [x] ffmpeg (N-123074)
- [x] MoviePy (2.2.1) — installed this session
- [x] GitHub CLI (2.88.1) — installed + authed as `larixavieruk7-web`
- [x] Vercel CLI — installed + authed as `larixavieruk7-1666`
- [x] Supabase CLI (2.83.0 via npx) — authed + linked to project `ekqpsozlqjmjlwzzpyxp`

## 3. NotebookLM Login — DONE
- [x] Authenticated (used in this session for video analysis)

## 4. Supabase Project — DONE
- [x] Project exists: `ekqpsozlqjmjlwzzpyxp` (West EU Ireland)
- [x] `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] `@supabase/supabase-js` and `@supabase/ssr` installed
- [x] SQL migration run: 6 tables created with RLS (transactions, category_rules, savings_targets, knowledge_entries, monthly_analyses, user_settings)
- [x] Auth config pushed: signups disabled, redirect URLs set, OTP 6-digit
- [x] 3 users created: lari_uk@gmail.com, larixavieruk7@gmail.com, gusampteam@hotmail.com
- [x] Site URL: `https://savings-lovat.vercel.app`
- [x] Redirect URLs: `http://localhost:3000/auth/callback`, `https://savings-lovat.vercel.app/auth/callback`
- [ ] **TODO**: Update magic link email template to use `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink` (must be done in Supabase dashboard → Auth → Email Templates → Magic Link)

## 5. Vercel Project — DONE
- [x] Project linked: `larixavieruk7-1666s-projects/savings_dashboard`
- [x] Domain: `savings-lovat.vercel.app`
- [x] GitHub connected: `larixavieruk7-web/savings` (auto-deploys on push)
- [x] Env vars set: `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 6. Supabase MCP — SKIPPED (using CLI instead)
MCP is authed to Gus's account. We use `npx supabase` CLI (authed to Larissa) for all database operations. See CLAUDE.md CLI Runbook.

---

## What's Already Done (from Gus's PC)
- [x] Commands copied: `/yt-research`, `/content-pipeline`, `/demo-video`
- [x] Playwright-cli skill with all 7 reference files
- [x] Auth pattern files in `docs/patterns/supabase-auth/`
- [x] Migration guide in `docs/patterns/supabase-migration/`
- [x] PWA pattern files in `docs/patterns/pwa/`
- [x] Vercel pattern files in `docs/patterns/vercel/`
- [x] CLAUDE.md updated with new sections (tools, patterns, plugins, CLI runbook, ownership isolation)
- [x] Existing commands preserved (check-context, handoff, cross-cutting-change)
