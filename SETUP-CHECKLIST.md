# Setup Checklist — Manual Steps on Larissa's PC

Everything else has already been written directly into this project by Claude Code from Gus's PC.
These are the remaining steps that must be run locally on this machine.

**Tell Claude Code:** "Read SETUP-CHECKLIST.md and execute everything you can"

---

## 0. Voice Input + Agent Teams + Effort Level (CRITICAL)

These configure Claude Code's global settings to match Gus's PC setup.
Run these commands in Claude Code:

### Voice input (press and hold `=` to talk)

Tell Claude Code:
```
Configure voice input: set voiceEnabled to true in global settings,
add environment variable AUDIODRIVER=waveaudio,
and create a keybinding mapping "=" to "voice:pushToTalk" in the Chat context.
```

Or manually create/edit these files:

**`C:\Users\Family\.claude\settings.json`** — add these fields:
```json
{
  "voiceEnabled": true,
  "env": {
    "AUDIODRIVER": "waveaudio"
  }
}
```

**`C:\Users\Family\.claude\keybindings.json`** — create this file:
```json
[
  {
    "key": "=",
    "command": "voice:pushToTalk",
    "when": "Chat"
  }
]
```

### Agent Teams (enables TeamCreate for parallel agent workstreams)

Add to the `env` section in `C:\Users\Family\.claude\settings.json`:
```json
{
  "env": {
    "AUDIODRIVER": "waveaudio",
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Effort Level (high = more thorough responses)

Add to `C:\Users\Family\.claude\settings.json`:
```json
{
  "effortLevel": "high"
}
```

### Combined — the full global settings.json should look like:

```json
{
  "voiceEnabled": true,
  "effortLevel": "high",
  "env": {
    "AUDIODRIVER": "waveaudio",
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "enabledPlugins": [
    "frontend-design@claude-plugins-official",
    "skill-creator@claude-plugins-official",
    "superpowers@claude-plugins-official"
  ]
}
```

**Note:** The `enabledPlugins` array will be populated automatically when you install the plugins in step 1.

---

## 1. Install Claude Code Plugins (3 commands)

Open Claude Code in this project directory, then run:

```
/install-plugin superpowers
/install-plugin skill-creator
/install-plugin frontend-design
```

These give Claude Code advanced capabilities: brainstorming, plan writing, TDD, debugging,
parallel agents, code review, skill creation, and frontend design guidance.

---

## 2. Verify Tools Already Installed

These should already be installed from previous sessions. Quick check:

```bash
# yt-dlp (YouTube research)
yt-dlp --version

# Python (for edge-tts, NotebookLM, MoviePy)
python --version

# NotebookLM CLI
python -m notebooklm --help

# edge-tts (free text-to-speech)
python -m edge_tts --list-voices | head -5
```

If any are missing:
```bash
# yt-dlp
winget install yt-dlp.yt-dlp

# edge-tts
pip install edge-tts

# NotebookLM
pip install "notebooklm-py[browser]"

# MoviePy (for demo video post-production)
pip install moviepy

# ffmpeg (for video encoding)
winget install Gyan.FFmpeg
```

---

## 3. NotebookLM Login (one-time, expires every few weeks)

```bash
python -m notebooklm login
```

This opens a browser — log in with the Google account. Session persists for weeks.

---

## 4. Supabase Project (when ready to migrate from localStorage)

1. Go to [supabase.com](https://supabase.com) and sign in with Larissa's Gmail
2. Create a new project (name: "savings-dashboard", region: eu-west-2)
3. Copy the project URL and anon key
4. Add to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
5. Install Supabase packages:
   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   ```
6. Go to Authentication → Email Templates → Magic Link
7. Update template to use: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink`
8. Add `http://localhost:3000` to Authentication → URL Configuration → Redirect URLs
9. Run the SQL migrations from `docs/patterns/supabase-migration/MIGRATION-GUIDE.md`

---

## 5. Vercel Project (when ready to deploy)

1. Go to [vercel.com](https://vercel.com) and sign in with Larissa's Gmail
2. Import the GitHub repo
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
4. Deploy
5. Update Supabase Auth → URL Configuration → Site URL to the Vercel domain

---

## 6. Install Supabase MCP (optional, for Claude Code database access)

If you want Claude Code to be able to query/manage the Supabase project directly:

```
Add to .claude/settings.local.json under permissions.allow:
"mcp__supabase__*"
```

Then configure the Supabase MCP server in Claude Code settings.

---

## What's Already Done (from Gus's PC)

- [x] Commands copied: `/yt-research`, `/content-pipeline`, `/demo-video`
- [x] Playwright-cli skill with all 7 reference files
- [x] Auth pattern files in `docs/patterns/supabase-auth/`
- [x] Migration guide in `docs/patterns/supabase-migration/`
- [x] PWA pattern files in `docs/patterns/pwa/`
- [x] Vercel pattern files in `docs/patterns/vercel/`
- [x] CLAUDE.md updated with new sections (tools, patterns, plugins)
- [x] Existing commands preserved (check-context, handoff, cross-cutting-change)
