Full content research pipeline: search YouTube → analyse with NotebookLM → generate deliverables.

## Usage
`/content-pipeline <topic>`

Deliverable types: `briefing` (default), `podcast`, `infographic`, `slides`, `quiz`, `mindmap`

## Steps

1. **Search YouTube** for relevant content:
   ```bash
   yt-dlp --flat-playlist --dump-single-json "ytsearch10:<topic>"
   ```

2. **Present results** in a table. Ask which videos to include (default: all).

3. **Create NotebookLM notebook**:
   ```bash
   nlm create-notebook "<topic> Research"
   ```

4. **Add selected videos as sources**:
   ```bash
   nlm add-source --youtube <url1> <url2> ...
   ```

5. **Generate briefing** (always do this first):
   ```bash
   nlm generate --type briefing
   ```

6. **Ask user** what deliverable they want, then generate:
   ```bash
   nlm generate --type <deliverable>
   nlm download --latest --output docs/research/media/
   ```

7. **Save all outputs**:
   - Briefing/analysis → `docs/research/<topic-slug>.md`
   - Media (podcast MP3, infographic PNG, slides PDF) → `docs/research/media/`
   - Display key insights summary to user

## Notes
- Podcast generation: 5-10 min. Infographics: 2-5 min. Slides: up to 15 min.
- NotebookLM processing is free — tokens handled by Google, not Claude
- Can also add non-YouTube sources: PDFs, URLs, Google Drive files, plain text
- Re-run on different topics to build research corpus in `docs/research/`
