// sim.js / dexSimulation.js

import {
  createEngineState,
  deposit,
  openPosition,
  closePosition,
  isLiquidatable,
  liquidatePosition,
  advanceBlocks,
  getMarkPrice,
  simulateEquityIfClosedNow,
} from "./perp.js";

// ANSI colors for terminal output
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

// Simulation-only metadata for positions
// We DO NOT touch perp.js state. This is only for logging.
const positionMeta = {};

/**
 * Small helper to get all open position IDs.
 */
function getOpenPositionIds(state) {
  return Object.values(state.positions)
    .filter((p) => p.status === "OPEN")
    .map((p) => p.id);
}

/**
 * Helper to get all open positions that are at least `minAgeBlocks` old.
 * Used so we don't randomly close positions immediately after open.
 */
function getOpenPositionIdsWithMinAge(state, minAgeBlocks) {
  const currentBlock = state.market.currentBlock;
  return Object.values(state.positions)
    .filter(
      (p) =>
        p.status === "OPEN" &&
        currentBlock - p.openBlock >= minAgeBlocks
    )
    .map((p) => p.id);
}

/**
 * Random helpers
 */
function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Snap a number to the nearest multiple of `step`.
 * Example: snapToStep(13, 5) → 15
 */
function snapToStep(x, step) {
  return Math.round(x / step) * step;
}

/**
 * Local leverage buckets (for logging / health calc).
 * Mirrors the DEX idea:
 *   0–10x  → 10% buffer
 *   10–20x → 20% buffer
 *   20–30x → 30% buffer
 */
const LEVERAGE_BUCKETS = [
  { maxLeverage: 10, bufferRatio: 0.10 },
  { maxLeverage: 20, bufferRatio: 0.20 },
  { maxLeverage: 30, bufferRatio: 0.30 },
];

function getBufferRatioFromLeverage(leverage) {
  for (const b of LEVERAGE_BUCKETS) {
    if (leverage <= b.maxLeverage) return b.bufferRatio;
  }
  return 0;
}

/**
 * Log all currently open positions for this block.
 *
 * For each position we print:
 *   - user, posId, side
 *   - tradeSize: how much user actually put into the trade at open (≈ margin + fee)
 *   - fee: fee taken at open (Mode 3)
 *   - realMargin: margin locked for risk
 *   - leverage: entryNotional / realMargin
 *   - buffer: liquidation buffer % currently applied (based on current leverage)
 *   - notional: entryNotional
 *   - qty@entry: baseSize @ entryPrice
 *   - avgClosePrice_ifNow: “price if he would sell now” from vAMM
 *   - pnlLoss_now: margin - equityIfClosed (how much margin is gone if closed now)
 *   - liquidationAtLoss: margin * (1 - bufferRatio)
 *       (max loss on margin before liquidation is allowed)
 *
 * Uses simulateEquityIfClosedNow, same math as liquidation.
 */
function logOpenPositions(state) {
  const markPrice = getMarkPrice(state.market);
  const openPositions = Object.values(state.positions).filter(
    (p) => p.status === "OPEN"
  );

  console.log("Open positions:");
  if (openPositions.length === 0) {
    console.log("  (none)");
    return;
  }

  for (const p of openPositions) {
    const realMargin = p.margin;

    const meta = positionMeta[p.id] || {};
    const tradeSize = meta.totalToUse ?? realMargin;
    const fee = meta.fee ?? 0;

    const notionalEntry = p.entryNotional;
    const notionalNow = p.baseSize * markPrice;

    const entryLev = realMargin > 0 ? notionalEntry / realMargin : 0;
    const levNow = realMargin > 0 ? notionalNow / realMargin : 0;
    const bufferRatio = getBufferRatioFromLeverage(levNow);
    const bufferPct = bufferRatio * 100;

    const {
      avgClosePrice,
      equityIfClosed,
    } = simulateEquityIfClosedNow(state, p.id);

    const pnlLossNow = Math.max(0, realMargin - equityIfClosed);
    const liquidationAtLoss = realMargin * (1 - bufferRatio);

    console.log(
      `  user=${p.userId}, posId=${p.id}, side=${
        p.isLong ? "LONG" : "SHORT"
      }, ` +
        `tradeSize=${tradeSize.toFixed(2)}, fee=${fee.toFixed(
          2
        )}, realMargin=${realMargin.toFixed(2)}, ` +
        `leverage=${entryLev.toFixed(2)}x, buffer=${bufferPct.toFixed(
          1
        )}%, notional=${notionalEntry.toFixed(2)}, ` +
        `qty@entry=${p.baseSize.toFixed(4)}@${p.entryPrice.toFixed(
          4
        )}, avgClosePrice_ifNow=${avgClosePrice.toFixed(
          4
        )}, ` +
        `pnlLoss_now=${pnlLossNow.toFixed(
          2
        )}, liquidationAtLoss=${liquidationAtLoss.toFixed(2)}`
    );
  }
}

/**
 * We want to allow the tradeFund to conceptually go negative in the simulation,
 * without changing the DEX engine (perp.js), which throws on underflow.
 *
 * Trick:
 * ------
 *   Before calling closePosition / liquidatePosition:
 *     - add a HUGE buffer to tradeFund (BIG_BUFFER)
 *   After the call:
 *     - subtract the same BIG_BUFFER.
 *
 * This way:
 *   - Inside perp.js, tradeFund never underflows.
 *   - After we subtract, tradeFund can be negative in the sim.
 */
const BIG_BUFFER = 1e12;

/**
 * Main simulation routine:
 * - 3 users: alice, bob, charlie
 * - Up to 10 random opens total
 * - 100 blocks of time
 * - At each block:
 *    - advance block (carry accrues)
 *    - sometimes open new trades
 *    - sometimes close existing trades (only if open ≥ 20 blocks)
 *    - check and liquidate any liquidable positions
 *    - print state of all open positions
 */
function runSimulation() {
  const state = createEngineState();

  const users = ["alice", "bob", "charlie"];

  // 1) Seed user balances (collateral)
  for (const u of users) {
    deposit(state, u, 10_000);
  }

  let totalOpenedPositions = 0;
  const MAX_POSITIONS = 10;
  const TOTAL_BLOCKS = 100;
  const MIN_AGE_FOR_USER_CLOSE = 20; // user won't close earlier than this (blocks)

  console.log("=== Starting simulation ===");
  console.log("Initial mark price:", getMarkPrice(state.market).toFixed(4));
  console.log("");

  for (let block = 1; block <= TOTAL_BLOCKS; block++) {
    console.log(`\n============================`);
    console.log(`Block ${block}`);
    console.log(`============================`);

    // 2) Advance the market by 1 block (carry index may move)
    advanceBlocks(state.market, 1);
    const markPrice = getMarkPrice(state.market);
    console.log("Mark price:", markPrice.toFixed(4));
    console.log(
      "OI (long, short):",
      state.market.longOpenInterest.toFixed(2),
      state.market.shortOpenInterest.toFixed(2)
    );
    console.log(
      "Cumulative carry index:",
      state.market.cumulativeCarryIndex.toFixed(6)
    );

    // 3) Randomly decide to open new positions (max 10 total)
    if (totalOpenedPositions < MAX_POSITIONS && Math.random() < 0.3) {
      const userId = randChoice(users);
      const isLong = Math.random() < 0.5;

      // totalToUse = "how much user wants to put into this trade"
      // between 100 and 2000, snapped by 100
      let rawBudget = randBetween(100, 2000);
      const totalToUse = Math.max(100, snapToStep(rawBudget, 100));

      // leverage between 5 and 15, snapped by 5 → 5, 10, 15
      let rawLeverage = randBetween(5, 15);
      const leverage = snapToStep(rawLeverage, 5);

      try {
        const pos = openPosition(state, {
          userId,
          isLong,
          totalToUse,
          leverage,
        });
        totalOpenedPositions++;

        // Save sim-only metadata
        positionMeta[pos.id] = {
          totalToUse,
          fee: pos.fee,
          feeRate: pos.feeRate,
        };

        const effLev =
          pos.effectiveLeverage || pos.entryNotional / pos.margin;

        console.log(
          `OPEN (Mode 3): user=${userId}, side=${
            isLong ? "LONG" : "SHORT"
          }, ` +
            `posId=${pos.id}, totalToUse=${totalToUse.toFixed(2)}, ` +
            `margin=${pos.margin.toFixed(2)}, fee=${pos.fee.toFixed(
              2
            )}, feeRate=${(pos.feeRate * 100).toFixed(3)}%, ` +
            `entryNotional=${pos.entryNotional.toFixed(
              2
            )}, baseSize=${pos.baseSize.toFixed(
              4
            )}, entryPrice=${pos.entryPrice.toFixed(
              4
            )}, requestedLev=${leverage.toFixed(
              2
            )}x, effectiveLev=${effLev.toFixed(2)}x`
        );
      } catch (e) {
        console.log("OPEN FAILED:", e.message);
      }
    }

    // 4) Randomly decide to close some open positions (user-initiated),
    //    BUT only if they have been open for at least MIN_AGE_FOR_USER_CLOSE blocks.
    const openPosIdsClosable = getOpenPositionIdsWithMinAge(
      state,
      MIN_AGE_FOR_USER_CLOSE
    );
    if (openPosIdsClosable.length > 0 && Math.random() < 0.2) {
      const posIdToClose = randChoice(openPosIdsClosable);
      const backupTradeFund = state.funds.tradeFund;
      state.funds.tradeFund += BIG_BUFFER; // top-up to avoid engine underflow

      try {
        const res = closePosition(state, posIdToClose);
        // Remove the top-up → tradeFund can now be negative in sim
        state.funds.tradeFund -= BIG_BUFFER;

        console.log(
          `CLOSE: user=${res.userId}, posId=${res.positionId}, ` +
            `avgClosePrice=${res.avgClosePrice.toFixed(
              4
            )}, pnlTrade=${res.pnlTrade.toFixed(
              2
            )}, carryPnl=${res.carryPnl.toFixed(
              2
            )}, totalPnl=${res.totalPnl.toFixed(2)}`
        );
      } catch (e) {
        // If something else failed, revert the tradeFund and log generic error.
        state.funds.tradeFund = backupTradeFund;
        console.log("CLOSE FAILED (other error):", e.message);
      }
    }

    // 5) Check all open positions for liquidation (keepers can liquidate anytime)
    const openPosIdsAfter = getOpenPositionIds(state);
    for (const posId of openPosIdsAfter) {
      if (!isLiquidatable(state, posId)) continue;

      // Pre-calc liquidation "health" using same concepts as the DEX
      const pos = state.positions[posId];
      const { equityIfClosed } = simulateEquityIfClosedNow(state, posId);

      const margin = pos.margin;
      const markP = getMarkPrice(state.market);
      const notionalNow = pos.baseSize * markP;
      const levNow = margin > 0 ? notionalNow / margin : 0;
      const bufferRatio = getBufferRatioFromLeverage(levNow);
      const allowedLoss = margin * (1 - bufferRatio);
      const lossNow = Math.max(0, margin - equityIfClosed);

      let healthTag = "HEALTHY (within buffer)";
      if (allowedLoss > 0) {
        const ratio = lossNow / allowedLoss; // >1 means beyond buffer
        if (ratio > 1.2) {
          healthTag = "UNHEALTHY (far beyond buffer)";
        } else if (ratio > 1.0) {
          healthTag = "MARGINALLY BEYOND BUFFER";
        }
      }

      const backupTradeFund = state.funds.tradeFund;
      state.funds.tradeFund += BIG_BUFFER;

      try {
        const liqRes = liquidatePosition(state, posId, "keeper");
        state.funds.tradeFund -= BIG_BUFFER;

        console.log(
          RED +
            `LIQUIDATE: user=${liqRes.userId}, posId=${liqRes.positionId}, ` +
            `avgClosePrice=${liqRes.avgClosePrice.toFixed(
              4
            )}, pnlTrade=${liqRes.pnlTrade.toFixed(
              2
            )}, carryPnl=${liqRes.carryPnl.toFixed(
              2
            )}, totalPnl=${liqRes.totalPnl.toFixed(
              2
            )}, liqFee=${liqRes.liqFee.toFixed(
              2
            )}, equityIfClosed=${liqRes.equityIfClosed.toFixed(
              2
            )}, ` +
            `lossNow=${lossNow.toFixed(2)}, allowedLoss=${allowedLoss.toFixed(
              2
            )}, health=${healthTag}` +
            RESET
        );
      } catch (e) {
        state.funds.tradeFund = backupTradeFund;
        console.log(RED + "LIQUIDATION FAILED (other error): " + e.message + RESET);
      }
    }

    // 6) Print state of all open positions for this block
    logOpenPositions(state);

    // 7) Summary of funds each block
    console.log("Funds summary:");
    for (const u of users) {
      const wallet = state.funds.users[u]?.wallet ?? 0;
      console.log(`  wallet[${u}] = ${wallet.toFixed(2)}`);
    }

    const tf = state.funds.tradeFund;
    const tfStr = tf < 0 ? `${RED}${tf.toFixed(2)}${RESET}` : tf.toFixed(2);

    console.log(
      "  tradeFund   =",
      tfStr,
      "insuranceFund =",
      state.funds.insuranceFund.toFixed(2),
      "protocolFees  =",
      state.funds.protocolFees.toFixed(2)
    );
  }

  console.log("\n=== Simulation finished ===");
}

// Run simulation
runSimulation();
