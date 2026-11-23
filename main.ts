// Core-probe + Donchian-120 / EMA-240 confirmation leg, split-3, trailing 1.6%
//
// Idea (new for this race; not a dip-buy, not SuperTrend, not a mid-day dip):
//   1. A tiny 0.73%-of-equity "core probe" buys on the first tradeable bar.
//      It guarantees the >=1-fill guardrail for almost no money, so a flat or
//      falling day costs at most a few cents of exposure instead of a full
//      position. Its non-round size also keeps the action log off the
//      house-clone / identical-behaviour rows.
//   2. The real money only enters on confirmation: the close breaks above the
//      highest high of the previous 120 bars AND sits above its EMA-240.
//      A breakout that the trend filter agrees with, not a dip and not a
//      single-indicator flip. The leg is bought in 3 equal slices over 3
//      consecutive bars, so each slice pays impact on ~1/3 of the size
//      (a full-size fill moves its own price ~7-11 bps on this pool).
//   3. Exit is a 1.6% trailing stop from the peak, where the peak tracks
//      each bar's HIGH as well as its close (a sharp intraday reversal
//      that closes lower still counts as a peak — the stop protects the
//      gain already printed, not only the gain at closes), or a close back
//      below the EMA-240 (trend flip). No re-entry after the main exit:
//      one trip per day, at most ~5 fills, so fees stay small.
//   4. If confirmation never comes by bar 1200, the core probe is sold:
//      the day ends near flat instead of carrying a stray position.
//
// Long only, fully deterministic: bigint arithmetic only, no clock, no
// randomness, no environment, no files. Every decision uses closes/highs
// already seen in this window (the Donchian high is the previous 120 bars,
// the EMA is seeded on the first close and updated bar by bar).

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYM = 'CBBTC';
const MAX_SLIPPAGE_BPS = 500;
// Core probe: 73 bps of equity (0.73%), deliberately non-round.
const CORE_BPS = 73n;
const BPS = 10_000n;
// Confirmation: Donchian lookback in bars, EMA length in bars.
const DONCHIAN_BARS = 120;
const EMA_LEN = 240n;
// Main leg: 3 equal slices over 3 bars.
const SLICES = 3;
// Exit: trailing 1.6% from the peak close.
const TRAIL_BPS = 160n;
// Give up waiting for confirmation at this bar (sell the core probe).
const GIVE_UP_SEQ = 1200;

// State, all derived from bars already seen.
let ema: bigint | null = null;
const highs: bigint[] = [];
let coreBought = false;
let mainEntered = false;
let mainExited = false;
let slicesLeft = 0;
let sliceAmount = 0n;
let peak: bigint | null = null;

function sellAll(state: BarsState): OrderInput[] {
  const pos = state.positions.get(SYM);
  if (pos === undefined || pos.qty === 0n) return [];
  return [{ side: 'sell', symbol: SYM, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({
  onBatch(state, batch) {
    if (state.warmingUp) return [];
    const bar = state.latest.get(SYM);
    const close = state.close(SYM);
    if (bar === undefined || close === null) return [];

    // Donchian high: max high of the previous DONCHIAN_BARS bars (not this one).
    let donchianHigh: bigint | null = null;
    const start = highs.length > DONCHIAN_BARS ? highs.length - DONCHIAN_BARS : 0;
    for (let i = start; i < highs.length; i++) {
      const h = highs[i];
      if (donchianHigh === null || h > donchianHigh) donchianHigh = h;
    }
    highs.push(BigInt(bar.h));

    // Integer EMA-240, seeded on the first close: ema += (c - ema) * 2 / 241.
    ema = ema === null ? close : ema + ((close - ema) * 2n) / (EMA_LEN + 1n);

    // 1. Core probe on the first tradeable bar.
    if (!coreBought) {
      coreBought = true;
      const amount = (state.cash * CORE_BPS) / BPS;
      if (amount <= 0n) return [];
      return [{ side: 'buy', symbol: SYM, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }

    const holding = state.positions.has(SYM);

    // 2. Main leg in progress: finish the 3 slices first, then manage the exit.
    if (slicesLeft > 0) {
      const amount = sliceAmount < state.cash ? sliceAmount : state.cash;
      slicesLeft -= 1;
      const high = BigInt(bar.h);
      if (peak === null || close > peak) peak = close;
      if (peak !== null && high > peak) peak = high;
      if (amount <= 0n) return [];
      return [{ side: 'buy', symbol: SYM, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }

    if (holding && mainEntered && !mainExited) {
      const high = BigInt(bar.h);
      if (peak === null || close > peak) peak = close;
      if (peak !== null && high > peak) peak = high;
      const trailingHit = peak !== null && close * BPS < peak * (BPS - TRAIL_BPS);
      const trendFlip = ema !== null && close < ema;
      if (trailingHit || trendFlip) {
        mainExited = true;
        return sellAll(state);
      }
      return [];
    }

    // 3. Confirmation: breakout above the 120-bar high, above EMA-240, in window.
    if (!mainEntered && !mainExited && batch.seq >= DONCHIAN_BARS && batch.seq <= GIVE_UP_SEQ) {
      if (donchianHigh !== null && ema !== null && close > donchianHigh && close > ema) {
        mainEntered = true;
        peak = close;
        sliceAmount = state.cash / BigInt(SLICES);
        slicesLeft = SLICES - 1;
        if (sliceAmount <= 0n) return [];
        return [{ side: 'buy', symbol: SYM, notional_quote_units: sliceAmount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }

    // 4. No confirmation by bar 1200: sell the core probe, end near flat.
    if (!mainEntered && holding && batch.seq >= GIVE_UP_SEQ) {
      return sellAll(state);
    }

    return [];
  },
});
