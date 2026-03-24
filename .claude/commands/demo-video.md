Record a polished demo video of a feature using Playwright + edge-tts + MoviePy + ffmpeg.

## Usage
`/demo-video <feature-name-or-description>`

## Inputs needed
- **Feature/page**: Which part of the app to demo (from $ARGUMENTS)
- **Script**: Narration text for each step — generate from feature description if not provided

## Steps

1. **Write the demo script** — create `e2e/demos/<feature-name>.spec.ts`:
   - Navigate to the feature, perform key interactions
   - Add `await page.waitForTimeout(2000)` pauses at narration points
   - Enable recording: `browser.newContext({ recordVideo: { dir: './demo-recordings/' } })`

2. **Generate narration audio** with edge-tts (free, unlimited):
   ```bash
   python -m edge_tts --text "<narration>" --voice en-GB-RyanNeural --write-media demo-recordings/<feature>-narration.mp3
   ```
   Available British voices: `en-GB-RyanNeural` (male), `en-GB-SoniaNeural` (female), `en-GB-ThomasNeural` (male)

3. **Run the Playwright demo**:
   ```bash
   npx playwright test e2e/demos/<feature-name>.spec.ts
   ```

4. **Post-production with MoviePy** (Python):
   - Fade in/out transitions (e.g., 0.5s fade in, 1s fade out)
   - Background music mixing (lower volume under narration)
   - Audio level adjustment and trimming
   - `pip install moviepy` if not installed

5. **Final encode with ffmpeg**:
   ```bash
   ffmpeg -i demo-recordings/<video>.webm -i demo-recordings/<feature>-narration.mp3 \
     -c:v libx264 -c:a aac -movflags +faststart -shortest demo-recordings/<feature>-final.mp4
   ```
   **Important:** Always use `-movflags +faststart` — moves moov atom to beginning for browser streaming.

6. **Review** — confirm with user, iterate on timing/narration as needed.

## Notes
- Playwright records WebM — ffmpeg converts to MP4
- Keep demos under 60s for social, under 3min for website
- Demo recordings saved to `demo-recordings/` (gitignored)
