# KasBullet — deployment guide

This repo is ready to push and deploy as-is. Everything below is copy-paste;
the only things you need to supply are your own accounts/keys, called out
explicitly at each step.

## 1. Push this to GitHub

```bash
cd kasbullet-repo
git init
git add .
git commit -m "Initial KasBullet site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/kasbullet.git
git push -u origin main
```

You'll need to create the empty repo on GitHub first (github.com → New
repository → don't initialize with a README, since this folder already has
one) and be logged in to `git push` (GitHub will prompt for auth, or use the
`gh` CLI / a personal access token if you have one set up).

## 2. Deploy it — pick one

**Netlify** (recommended if you want a dashboard + easy custom domain later)
1. netlify.com → sign up / log in → "Add new site" → "Import an existing
   project" → connect GitHub → pick this repo.
2. Build settings: leave "Build command" blank, set "Publish directory" to
   `.` (repo root). It's a static site — nothing to build.
3. Deploy. You'll get a `random-name-123.netlify.app` URL immediately, and
   every future `git push` redeploys automatically — including when the news
   automation commits an update.

**Cloudflare Pages** (same idea, Cloudflare's network)
1. dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git →
   pick this repo.
2. Framework preset: "None". Build command: blank. Output directory: `/`.
3. Deploy. You get a `project-name.pages.dev` URL, same auto-redeploy-on-push
   behavior.

**GitHub Pages** (if you'd rather not add a third-party host)
1. Repo → Settings → Pages → Source: "Deploy from a branch" → `main` → `/root`.
2. Your site is at `https://YOUR-USERNAME.github.io/kasbullet/`.

## 3. Turn on the news automation

See `NEWS-AUTOMATION.md` for the full walkthrough. Short version:
- Get a YouTube Data API key (console.cloud.google.com) and an Anthropic API
  key (console.anthropic.com).
- Add both as **repo secrets**: Settings → Secrets and variables → Actions →
  New repository secret → `YOUTUBE_API_KEY` and `ANTHROPIC_API_KEY`.
- Go to the **Actions** tab → "Update Kaspa News Feed" → "Run workflow" to
  populate `data/news.json` for the first time.
- After that it runs itself every 6 hours.

## 4. Set your Buttondown username

Open `index.html`, find this line in the Subscribe section:

```html
action="https://buttondown.com/api/emails/embed-subscribe/YOUR-BUTTONDOWN-USERNAME"
```

Replace `YOUR-BUTTONDOWN-USERNAME` with your real one, commit, push.

## 5. Custom domain (optional)

Buy a domain anywhere (Namecheap, Cloudflare Registrar, Google Domains,
etc.), then in your host's dashboard (Netlify: Site settings → Domain
management; Cloudflare Pages: your project → Custom domains) add it and
follow the DNS instructions shown there — usually one CNAME record.

## What's already real-time and needs nothing further

- **TradingView charts** stream live tick data once the page is served from a
  real domain — no setup needed beyond deploying.
- **KAS price ticker** polls CoinGecko's public API every 20 seconds — free,
  no key required.

## What to check once it's live (not just opened as a local file)

- The subscribe form (hidden-iframe submission behaves differently from
  `file://`)
- The news section (relative fetch to `data/news.json` needs a real server)
- Mobile layout
