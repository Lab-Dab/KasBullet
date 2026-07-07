// generate-news.mjs
//
// Run by .github/workflows/update-news.yml on a schedule.
// 1. Resolves the KaspaWojak channel's uploads playlist.
// 2. Finds videos not already in data/news.json.
// 3. Pulls each video's transcript.
// 4. Asks Claude to turn the transcript into a short news-style story.
// 5. Writes the result into data/news.json.
//
// Required environment variables:
//   YOUTUBE_API_KEY        - a YouTube Data API v3 key (console.cloud.google.com)
//   YOUTUBE_CHANNEL_HANDLE - channel handle without the @, e.g. "KaspaWojak"
//   ANTHROPIC_API_KEY      - your Anthropic API key (console.anthropic.com)

import { YoutubeTranscript } from 'youtube-transcript';
import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_HANDLE = (process.env.YOUTUBE_CHANNEL_HANDLE || 'KaspaWojak').replace(/^@/, '');
const NEWS_PATH = path.join(process.cwd(), '..', 'data', 'news.json');
const MAX_NEW_VIDEOS_PER_RUN = 5; // safety cap so one run can't burn your whole API quota/budget
const MAX_FEED_LENGTH = 60;       // how many stories to keep in the feed

if (!YOUTUBE_API_KEY) {
  console.error('Missing YOUTUBE_API_KEY');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

async function getUploadsPlaylistId(handle) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${encodeURIComponent(handle)}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items || !data.items.length) {
    throw new Error(`Could not resolve channel handle "@${handle}". Check the handle and API key.`);
  }
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getRecentVideos(playlistId, max = 15) {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${max}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items) return [];
  return data.items.map(item => ({
    videoId: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnail:
      item.snippet.thumbnails?.maxres?.url ||
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.default?.url,
  }));
}

async function getTranscriptText(videoId) {
  try {
    const chunks = await YoutubeTranscript.fetchTranscript(videoId);
    return chunks.map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.warn(`No transcript available for ${videoId}: ${err.message}`);
    return null;
  }
}

async function writeStory({ title, description, transcript }) {
  const source = transcript
    ? `Transcript:\n${transcript.slice(0, 12000)}`
    : `No transcript was available. Use only this video description:\n${description || '(no description)'}`;

  const prompt = `You are the news editor for KasBullet, a Kaspa (KAS) cryptocurrency dashboard. \
A new video was posted on the KaspaWojak YouTube channel titled "${title}".

${source}

Write a short news-style update (120-180 words) summarizing what this video covers, for readers who want the \
substance without watching the full video. Neutral, factual tone — no hype, no price predictions, no financial \
advice. Do not invent facts that aren't in the source material above; if the source is thin, keep the story short \
and general rather than filling in unsupported details.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"headline": "a punchy 6-12 word headline", "story": "the 120-180 word story", "tags": ["tag1", "tag2", "tag3"]}`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content.find(b => b.type === 'text')?.text || '{}';
  try {
    return JSON.parse(raw.trim());
  } catch {
    console.warn('Model did not return clean JSON, storing raw text as story.');
    return { headline: title, story: raw.trim(), tags: [] };
  }
}

async function main() {
  let feed = [];
  try {
    feed = JSON.parse(await readFile(NEWS_PATH, 'utf-8'));
  } catch {
    console.log('No existing data/news.json found, starting fresh.');
  }
  const existingIds = new Set(feed.map(item => item.videoId));

  const playlistId = await getUploadsPlaylistId(CHANNEL_HANDLE);
  const recent = await getRecentVideos(playlistId);
  const newVideos = recent.filter(v => !existingIds.has(v.videoId)).slice(0, MAX_NEW_VIDEOS_PER_RUN);

  if (!newVideos.length) {
    console.log('No new videos found. Feed is up to date.');
    return;
  }

  for (const video of newVideos) {
    console.log(`Processing new video: ${video.title} (${video.videoId})`);
    const transcript = await getTranscriptText(video.videoId);
    const { headline, story, tags } = await writeStory({
      title: video.title,
      description: video.description,
      transcript,
    });

    feed.unshift({
      videoId: video.videoId,
      headline: headline || video.title,
      story,
      tags: tags || [],
      thumbnail: video.thumbnail,
      publishedAt: video.publishedAt,
      videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
      channelUrl: `https://www.youtube.com/@${CHANNEL_HANDLE}`,
      generatedAt: new Date().toISOString(),
      transcriptAvailable: Boolean(transcript),
    });
  }

  feed.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  feed = feed.slice(0, MAX_FEED_LENGTH);

  await writeFile(NEWS_PATH, JSON.stringify(feed, null, 2));
  console.log(`Wrote ${newVideos.length} new stor${newVideos.length === 1 ? 'y' : 'ies'} to data/news.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
