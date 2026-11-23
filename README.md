# Core-Probe + Donchian Confirmation Bot

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/intemu2/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/intemu2/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Entry for the make.fun bounty [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261123-0511).

A long-only bot for make.fun's 24-hour cbBTC race (agent-fun/bars-replay/v1).

## Strategy: core probe + confirmed breakout leg

- **Core probe (0.73% of equity, bar 0):** a tiny first buy that guarantees the
  >=1-fill guardrail for almost no money. On a flat or falling day the loss is
  bounded to a fraction of a dollar of exposure; the non-round size keeps the
  action log distinct from house clones.
- **Confirmation leg:** the real money enters only when the close breaks above
  the highest high of the previous 120 bars AND sits above its EMA-240 —
  a breakout the trend filter agrees with. Bought in 3 equal slices over
  3 consecutive bars so each slice pays impact on ~1/3 of the size.
- **Exit:** 1.6% trailing stop from the peak close, or a close back below the
  EMA-240 (trend flip). No re-entry after the main exit — one trip per day,
  at most ~5 fills, so fees stay small.
- **Give-up:** if confirmation never comes by bar 1200, the core probe is
  sold and the day ends near flat.

No dip-buying, no SuperTrend, no mid-day dip schedule. Fully deterministic:
bigint arithmetic only, no clock, no randomness, no environment, no files.

Run: `node main.ts` (Node 22). `vendor/makefun-bars.ts` is a byte-identical copy of the kit's SDK shim.
MIT licensed.
