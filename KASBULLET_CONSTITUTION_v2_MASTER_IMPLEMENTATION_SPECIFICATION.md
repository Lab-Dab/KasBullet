# KASBULLET CONSTITUTION v2.0

## MASTER IMPLEMENTATION SPECIFICATION

This document supersedes all previous implementation prompts.

## GOVERNING RULE

This specification is the single source of truth for the KasBullet repository.

The objective is not to redesign KasBullet. The objective is to evolve the existing foundation into a production-grade institutional Kaspa intelligence terminal.

Existing architecture should be preserved whenever possible. Existing services should be extended rather than replaced. Existing styling should be reused rather than rewritten.

---

# PROJECT PRINCIPLES

KasBullet is not:

- TradingView
- CoinMarketCap
- Glassnode
- CryptoQuant
- DeFiLlama

KasBullet is:

- A Kaspa-first Intelligence Terminal
- A historical research platform
- A network intelligence platform
- A valuation platform
- An institutional dashboard

Every homepage component must answer:

**What has happened in the Kaspa ecosystem, and what does the data objectively show?**

Never:

- Predictions
- Opinions
- AI-generated market commentary
- Financial advice

Always:

- Raw data
- Historical context
- Objective summaries
- Transparent methodology

---

# CORE ENGINE RULES

Every metric has exactly one source of truth.

Never:

- Duplicate API requests
- Duplicate calculations
- Duplicate metrics
- Duplicate rendering logic

Always:

CoreEngine -> ProviderManager -> StateStore -> CacheManager -> TimeSeriesEngine -> AnalyticsEngine -> IntelligenceEngine -> EventBus

All UI consumes this shared state.

---

# MODULARITY

Each homepage module owns:

- Renderer
- State
- Styles
- Update logic

Modules never communicate directly.

Communication occurs only through:

- CoreEngine
- EventBus
- StateStore

---

# PERFORMANCE BUDGET

- Initial render under 2 seconds
- Historical fetches: One
- Chart instance: One
- Incremental live updates only
- Duplicate requests: Zero
- Memory leaks: Zero
- Background prefetch enabled
- Shared cache mandatory

---

# HOMEPAGE PHILOSOPHY

Homepage order:

1. Header
2. Live Intelligence Ribbon
3. KasBullet Snapshot
4. Kaspa Market Terminal
5. Kaspa Comparison Terminal
6. Market Intelligence
7. Supply Intelligence
8. Network Intelligence
9. Market Cap Terminal
10. KasBullet Brief
11. Latest Alerts

The homepage educates first.

Trading functionality belongs inside Research and Lab workspaces.

---

# FUTURE EXPANSION RULE

Future development expands through new workspaces, not homepage redesign.

Examples:

- Research
- Labs
- Portfolio
- Watchlists
- Screeners
- Historical Explorer
- API
- Mobile

Homepage evolution should be refinement, never replacement.

---

# IMPLEMENTATION RULE

Treat every implementation as architecture work.

If existing layouts prevent faithful implementation, refactor carefully while preserving the KasBullet design language and service architecture.

Repository must remain runnable after every commit.
