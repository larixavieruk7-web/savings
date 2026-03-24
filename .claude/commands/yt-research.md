Search YouTube for competitive/market research using yt-dlp. Returns structured video data for analysis.

## Usage
`/yt-research <search query>`

## Steps

1. **Search YouTube** with the user's query:
   ```bash
   yt-dlp --flat-playlist --dump-single-json "ytsearch10:$ARGUMENTS"
   ```

2. **Parse and present** results in a table: Title, Channel, Views, Duration, URL, Upload Date

3. **Ask** what the user wants next:
   - **Analyse**: Send top videos to NotebookLM for trend/gap analysis
   - **Deep dive**: Fetch full metadata on specific videos (`yt-dlp -j --no-download <url>`)
   - **Export**: Save results to `docs/research/<topic-slug>.md`

4. **If analysis requested**, use notebooklm-py CLI:
   ```bash
   nlm create-notebook "$ARGUMENTS Research"
   nlm add-source --youtube <url1> <url2> ...
   nlm generate --type briefing
   ```

## Tips
- Channel scraping: `yt-dlp --flat-playlist --dump-single-json "https://youtube.com/@channel"`
- Sort by date: use `ytsearchdate:` prefix instead of `ytsearch:`
- Get more results: change `ytsearch10` to `ytsearch25`
- NotebookLM accepts up to 50 sources per notebook
