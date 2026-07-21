# KasBullet

KasBullet is a static institutional intelligence terminal for Kaspa. The
homepage foundation is organized around permanent containers for market, supply,
network, cycle, summary and feed intelligence, backed by shared browser-side
data services. The Core Intelligence Engine initializes the asset registry,
provider manager, cache, state store, time-series layer, analytics engines,
comparison engine, Kaspa intelligence service, macro market service, refresh
scheduler, event bus and health monitor from one permanent entrypoint.

The governing product and architecture blueprint is
`KASBULLET_CONSTITUTION_v2_MASTER_IMPLEMENTATION_SPECIFICATION.md`.

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
- Kaspa public API: network, blockdag, coin supply and hashrate context where
  endpoints are available.
- Stooq daily series: configurable macro history provider for gold, silver, oil,
  Nasdaq, S&P 500 and DXY comparison containers.
- `data/news.json`: local generated alert feed.

Unavailable panels display `Unavailable` instead of fabricated values. Global
M2, exchange balances, cycle scores and unsupported future metrics need verified
providers or models before they should render live numbers.

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
