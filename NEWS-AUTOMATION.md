# KasBullet - automated intelligence feed

This prepares a self-updating market intelligence feed for KasBullet. A
scheduled GitHub Action checks a configured verified source channel for new
uploads, pulls the transcript, asks Claude to write a short factual update, and
commits the result to `data/news.json`.

The homepage currently exposes feed category containers and does not render
creator-specific or opinion content.

## One-time setup

1. Push this folder to a GitHub repo. The automation lives in GitHub Actions, so
   the repo needs to be on GitHub.

2. Get a YouTube Data API key.
   - Go to console.cloud.google.com, create or select a project, enable
     "YouTube Data API v3", then create an API key.

3. Get an Anthropic API key.
   - Create one from the Anthropic console.

4. Add repo secrets:
   - `YOUTUBE_API_KEY`
   - `ANTHROPIC_API_KEY`

5. Set the verified source channel handle:
   - Settings -> Secrets and variables -> Actions -> Variables
   - Add `YOUTUBE_CHANNEL_HANDLE` without the `@`.

6. Deploy the site (`index.html` + `data/news.json`) to any static host.

## How It Decides What Is New

Each run pulls the configured channel's most recent uploads, compares video IDs
against what is already in `data/news.json`, and only processes items it has not
seen. It processes at most 5 new videos per run as a safety cap on API spend.

## If A Video Has No Captions

If a transcript is unavailable, the script falls back to the video description
and writes a shorter, general update. It should not invent details that are not
present in the source material.

## Adjusting The Tone

Edit the prompt inside `writeStory()` in `scripts/generate-news.mjs`. Keep the
tone factual, neutral, non-promotional, and free of financial advice.
