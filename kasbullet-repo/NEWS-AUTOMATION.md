# KasBullet — automated KaspaWojak news feed

This adds a self-updating news section to KasBullet. A scheduled GitHub Action
checks the KaspaWojak YouTube channel for new uploads, pulls the transcript,
asks Claude to write a short news story, and commits the result to
`data/news.json`. The site fetches that file and renders it — no server to run,
no database.

## One-time setup

1. **Push this folder to a GitHub repo.** The automation lives in GitHub
   Actions, so the repo needs to be on GitHub (a public or private repo both
   work).

2. **Get a YouTube Data API key.**
   - Go to console.cloud.google.com → create/select a project → enable
     "YouTube Data API v3" → Credentials → Create API key.
   - Free tier covers this easily (checking for new uploads a few times a day
     is a handful of quota units).

3. **Get an Anthropic API key.**
   - console.anthropic.com → Settings → API Keys.
   - Each summary costs a small fraction of a cent to a few cents depending on
     video length — budget for your upload frequency.

4. **Add repo secrets** (Settings → Secrets and variables → Actions → New
   repository secret):
   - `YOUTUBE_API_KEY`
   - `ANTHROPIC_API_KEY`

5. **(Optional) Set the channel handle** if it's ever not "KaspaWojak":
   Settings → Secrets and variables → Actions → Variables tab →
   `YOUTUBE_CHANNEL_HANDLE`.

6. **Deploy the site** (`index.html` + `data/news.json`) to any static host —
   Netlify, Vercel, GitHub Pages, Cloudflare Pages all work. Deploy the whole
   repo (or at least `index.html` and the `data/` folder together) so the
   relative fetch to `data/news.json` resolves.

That's it. The workflow in `.github/workflows/update-news.yml` runs every 6
hours automatically, and you can also trigger it manually from the repo's
**Actions** tab (`Update Kaspa News Feed` → **Run workflow**) any time you want
it to check right away after uploading a new video.

## How it decides what's "new"

Each run pulls the channel's most recent uploads, compares video IDs against
what's already in `data/news.json`, and only processes ones it hasn't seen. It
processes at most 5 new videos per run (`MAX_NEW_VIDEOS_PER_RUN` in
`scripts/generate-news.mjs`) as a safety cap on API spend — raise it if you
ever upload in bursts.

## If a video has no captions

YouTube auto-generates captions for most uploads, and the script pulls those
for the transcript. If a video genuinely has none, the script falls back to
the video's description and writes a shorter, more general story — it never
invents details it can't source. You can always hand-edit an entry directly in
`data/news.json` afterward.

## Adjusting the tone or length of the stories

Edit the prompt inside `writeStory()` in `scripts/generate-news.mjs`. That's
the only place the story-writing instructions live.

## Cost control

- Swap `model: 'claude-sonnet-5'` for `'claude-haiku-4-5-20251001'` in
  `generate-news.mjs` for a cheaper, faster model if the stories are simple
  enough not to need Sonnet-level writing.
- Lower the cron frequency in `.github/workflows/update-news.yml` if every-6-
  hours checks more often than you upload.
