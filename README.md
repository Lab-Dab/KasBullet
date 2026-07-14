# KasBullet

KasBullet is a static institutional intelligence terminal for Kaspa. The
homepage foundation is organized around permanent containers for market, supply,
network, cycle, summary and feed intelligence, backed by shared browser-side
data services.

## Run Locally

Serve the repository root with any static server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

Opening `index.html` directly may block `fetch("data/news.json")` in some
browsers, so a local server is recommended.

## Data Sources

- CoinGecko public API: KAS, BTC and ETH prices, market caps, dominance context,
  circulating supply, and KAS price history.
- `data/news.json`: local generated alert feed.
- `kas.fyi`: linked for live Kaspa explorer detail.

Unavailable panels display `Unavailable` instead of fabricated values. Global
M2, exchange balances, cycle scores, AI summaries, metals, commodities, and
equity indexes need verified providers or models before they should render live
numbers.

## Feed Automation

The optional GitHub Action in `.github/workflows/update-news.yml` updates
`data/news.json` from a configured verified source channel.

Required secrets:

- `YOUTUBE_API_KEY`
- `ANTHROPIC_API_KEY`

Required variable:

- `YOUTUBE_CHANNEL_HANDLE`

See `NEWS-AUTOMATION.md` for details.

## Deployment

Deploy the repository root to any static host:

- Netlify: no build command, publish directory `.`
- Cloudflare Pages: framework preset `None`, output directory `/`
- GitHub Pages: deploy from the root of `main`

No build step is required.
