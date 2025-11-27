/**
 * ============================================================
 * vAMM Perp DEX Engine (single asset, no oracle, OI carry)
 * ============================================================
 *
 * High-level mental model:
 * ------------------------
 * - There is a single perpetual market with a virtual AMM (vAMM).
 * - The vAMM has virtual base and quote reserves (x and y),
 *   and price = y / x (constant product, x * y = k).
 * - Users:
 *     - deposit collateral to a wallet balance
 *     - open leveraged long/short positions
 *     - each position has:
 *         - margin
 *         - base size
 *         - entry price
 *         - a snapshot of a carry index (for funding)
 * - There is no external oracle. Price is *purely* the vAMM.
 * - The "carry" (funding) comes from open interest imbalance:
 *     - if longs > shorts, longs pay shorts
 *     - if shorts > longs, shorts pay longs
 *   and it accumulates in a cumulative index over blocks.
 *
 * Liquidation rule (conceptual):
 * ------------------------------
 * - We ask: "If I closed this position right now, using the vAMM:
 *      - what average price would I get?
 *      - what would my PnL be (trading + carry)?
 *      - what would my equity be (margin + PnL)?"
 * - We compute a leverage-dependent *buffer ratio* that says:
 *      - what minimum fraction of margin must remain as equity
 *        for different leverage buckets:
 *          - 0–10x: 10% must remain
 *          - 10–20x: 20% must remain
 *          - 20–30x: 30% must remain
 * - In words:
 *      "If user losses are bigger than (margin - buffer),
 *       or equivalently, if equity after close is less than
 *       buffer% of margin, then the position can be liquidated."
 *
 * Everything below is:
 *     - plain JS objects (state)
 *     - pure-ish functions operating on that state
 */

/* ============================================================
 * 1. CONFIG & CONSTANTS
 * ============================================================
 *
 * This section defines all tunable parameters of the system.
 * In a real protocol most of these would be governance-settable.
 */

const CONFIG = {
  // vAMM initial reserves (virtual).
  // Think: we are starting with x units of base, y units of quote.
  // The initial price is roughly y / x.
  INITIAL_BASE_RESERVE: 100_000,       // x
  INITIAL_QUOTE_RESERVE: 100_000,  // y

  // Margin & leverage control.

MAX_LEVERAGE: 30,       

  // MAINTENANCE_MARGIN_RATIO is here for completeness.
  // We don't use it directly in the liquidation formula (we instead
  // implement "margin - buffer" logic), but you can incorporate it
  // if you want a more classical model.
  MAINTENANCE_MARGIN_RATIO: 0.05,    // 5% (optional in this model)

  // Liquidation fee:
  // - when a position is liquidated, we charge this % of the position's
  //   notional as a fee. This can go partly to the liquidator, partly to
  //   insurance or protocol. In this simple model we give it to liquidator.
  LIQUIDATION_FEE_RATIO: 0.005,      // 0.5% of close notional

  // Base open fee:
  // - charged on notional when opening a position.
  // - this is your baseline trading fee, before skew adjustments.
  BASE_OPEN_FEE_RATE: 0.001,         // 0.1% of notional

  // Carry (funding) parameters:
  // - "carry" here is an OI-based funding. No oracle.
  // - Each block: we look at OI imbalance and increment a cumulative index.
  BASE_CARRY_RATE_PER_BLOCK: 0.0001, // base dimensionless per block
  CARRY_SENSITIVITY: 1.0,            // how strongly OI imbalance affects carry

  // OI skew fee:
  // - If there is OI imbalance, we want opening positions on the heavy side
  //   to be more expensive (or just scale the fee).
  // - We do: fee *= (1 + |imbalanceRatio| * OI_SKEW_FEE_MULTIPLIER)
  OI_SKEW_FEE_MULTIPLIER: 1.0,

  // Fee splitting:
  // - When we collect trading fees, we send some to insurance, some to protocol.
  FEE_SPLIT: {
    TO_INSURANCE: 0.5,
    TO_PROTOCOL: 0.5,
  },

  // Leverage buckets:
  // - We map current leverage -> liquidation buffer ratio.
  // - This controls how much *minimum equity as % of margin* we require.
  LEVERAGE_BUCKETS: [
    { maxLeverage: 10, bufferRatio: 0.10 },     // 0–10x  → must keep 10% of margin
    { maxLeverage: 20, bufferRatio: 0.20 },     // 10–20x → must keep 20% of margin
    { maxLeverage: 30, bufferRatio: 0.30 }      // 20–30x → must keep 30% of margin
  ],
};

/**
 * Given current leverage, return the liquidation buffer ratio.
 *
 * Example:
 * - leverage = 7x   → 0.10  (needs at least 10% of margin left)
 * - leverage = 15x  → 0.20
 * - leverage = 30x  → 0.30
 */
function getLiquidationBufferRatio(leverage) {
  for (const bucket of CONFIG.LEVERAGE_BUCKETS) {
    if (leverage <= bucket.maxLeverage) return bucket.bufferRatio;
  }
  return 0;
}

/* ============================================================
 * 2. STATE OBJECT FACTORIES
 * ============================================================
 *
 * These helpers create the initial state objects.
 * They are just plain JS objects, no classes.
 */

/**
 * MarketState:
 *
 * This object represents the **state of the single perp market**.
 * It includes:
 * - vAMM reserves (base, quote, k)
 * - Open interest for longs and shorts
 * - Carry (funding) cumulative index
 * - Simple block counter used for carry updates
 */
function createMarketState() {
  const baseReserve = CONFIG.INITIAL_BASE_RESERVE;
  const quoteReserve = CONFIG.INITIAL_QUOTE_RESERVE;
  return {
    baseReserve,
    quoteReserve,
    k: baseReserve * quoteReserve, // constant product invariant

    longOpenInterest: 0,  // sum notional of long positions
    shortOpenInterest: 0, // sum notional of short positions

    // OI-based carry index:
    // - This is a running "index" that moves every block if OI is imbalanced.
    // - A position stores a snapshot of this when opened.
    cumulativeCarryIndex: 0,

    // Simple discrete time / block counter:
    currentBlock: 0,
    lastFundingBlock: 0,
  };
}

/**
 * FundsState:
 *
 * This object represents "real" collateral and protocol funds:
 * - users[userId].wallet: user's free balance (can be used as margin)
 * - tradeFund: pool that holds all margin + PnL
 * - insuranceFund: backstop that covers bad debt
 * - protocolFees: collected trading fees for protocol
 */
function createFundsState() {
  return {
    users: {},        // userId -> { wallet: number }
    tradeFund: 100000,
    insuranceFund: 100000,
    protocolFees: 0,
  };
}

/**
 * Position:
 *
 * This object represents a **single leveraged perpetual position**:
 * - userId: owner
 * - isLong: long or short
 * - baseSize: quantity of base asset in the position (always positive)
 * - entryPrice: average entry price (quote / base)
 * - entryNotional: baseSize * entryPrice
 * - margin: margin locked for this position
 * - carrySnapshot: carry index at open (used to compute trailing OI carry later)
 * - openBlock: block when opened
 * - status: "OPEN" / "CLOSED" / "LIQUIDATED"
 */
function createPosition({
  id,
  userId,
  isLong,
  baseSize,
  entryPrice,
  margin,
  carrySnapshot,
  openBlock,
}) {
  return {
    id,
    userId,
    isLong,

    baseSize,                        // absolute base quantity
    entryPrice,
    entryNotional: baseSize * entryPrice,

    margin,
    carrySnapshot,
    openBlock,

    status: "OPEN",
    realizedPnl: 0,
  };
}

/**
 * EngineState:
 *
 * This is the top-level object used by the whole engine. It holds:
 * - market: the MarketState
 * - funds: the FundsState
 * - positions: a map of positionId -> Position
 * - nextPositionId: simple incremental counter for IDs
 */
function createEngineState() {
  return {
    market: createMarketState(),
    funds: createFundsState(),
    positions: {},       // positionId -> Position
    nextPositionId: 1,
  };
}

/* ============================================================
 * 3. FUNDS / USERS HELPERS
 * ============================================================
 *
 * These functions deal with user wallet balances and the "tradeFund".
 * Conceptually:
 * - wallet = user's free collateral they control.
 * - tradeFund = somewhat like a shared "margin pool" holding all
 *               margin & unrealized PnL.
 */

/** Make sure we have an entry for this user. */
function ensureUser(funds, userId) {
  if (!funds.users[userId]) {
    funds.users[userId] = { wallet: 0 };
  }
}

/** User deposit: adds to user's free wallet balance. */
function deposit(state, userId, amount) {
  ensureUser(state.funds, userId);
  state.funds.users[userId].wallet += amount;
}

/** User withdraw: removes from wallet (if enough). */
function withdraw(state, userId, amount) {
  ensureUser(state.funds, userId);
  const user = state.funds.users[userId];
  if (user.wallet < amount) throw new Error("Insufficient wallet balance");
  user.wallet -= amount;
  return amount;
}

/**
 * Move funds from user wallet into the tradeFund as margin.
 * This is what happens when a user opens a position: they lock some margin.
 */
function moveWalletToTradeFund(state, userId, amount) {
  ensureUser(state.funds, userId);
  const user = state.funds.users[userId];
  if (user.wallet < amount) throw new Error("Insufficient wallet for margin");
  user.wallet -= amount;
  state.funds.tradeFund += amount;
}

/**
 * Move funds from tradeFund back to user's wallet.
 * This is what happens when:
 * - they close a profitable position and get margin + PnL back, or
 * - partial release of margin.
 */
function moveTradeFundToWallet(state, userId, amount) {
  ensureUser(state.funds, userId);
  if (state.funds.tradeFund < amount) {
    throw new Error("TradeFund underflow");
  }
  state.funds.tradeFund -= amount;
  state.funds.users[userId].wallet += amount;
}

/**
 * Allocate trading fees:
 * - take a total tradingFee and split it between insurance and protocol.
 * - In this simple model, no fee goes directly back to tradeFund.
 */
function allocateFees(state, tradingFee) {
  const toInsurance = tradingFee * CONFIG.FEE_SPLIT.TO_INSURANCE;
  const toProtocol = tradingFee * CONFIG.FEE_SPLIT.TO_PROTOCOL;
  state.funds.insuranceFund += toInsurance;
  state.funds.protocolFees += toProtocol;
}

/**
 * Pay liquidation reward to liquidator:
 * - we "pay" them by taking from tradeFund and giving to their wallet.
 * - if tradeFund is insufficient, this would throw.
 */
function payLiquidationReward(state, liquidatorId, amount) {
  ensureUser(state.funds, liquidatorId);
  if (state.funds.tradeFund < amount) {
    throw new Error("TradeFund underflow when paying liquidator");
  }
  state.funds.tradeFund -= amount;
  state.funds.users[liquidatorId].wallet += amount;
}

/**
 * Cover bad debt:
 * - If a position's equity is negative at close/liquidation, that deficit
 *   must be paid by the system.
 * - We first use insuranceFund. If that is insufficient, we dip into tradeFund.
 * - If even tradeFund is not enough, we log "system bad debt".
 */
function coverBadDebt(state, amount) {
  const fromInsurance = Math.min(state.funds.insuranceFund, amount);
  state.funds.insuranceFund -= fromInsurance;

  const remaining = amount - fromInsurance;
  if (remaining > 0) {
    if (state.funds.tradeFund >= remaining) {
      state.funds.tradeFund -= remaining;
    } else {
      console.warn("System bad debt: insurance + tradeFund insufficient.");
      state.funds.tradeFund = 0;
    }
  }
}

/* ============================================================
 * 4. MARKET HELPERS (PRICE, OI, CARRY)
 * ============================================================
 *
 * Helper functions for:
 * - computing mark price
 * - computing open interest and imbalance
 * - advancing "blocks" and accruing carry (funding)
 */

/** Current mark price from vAMM = quoteReserve / baseReserve. */
function getMarkPrice(market) {
  return market.quoteReserve / market.baseReserve;
}

/** Total open interest (notional) across longs and shorts. */
function getTotalOI(market) {
  return market.longOpenInterest + market.shortOpenInterest;
}

/**
 * OI imbalance:
 * - positive means more longs than shorts
 * - negative means more shorts than longs
 */
function getImbalance(market) {
  return market.longOpenInterest - market.shortOpenInterest;
}

/**
 * Advance the market "time" by numBlocks.
 * For each block, we call updateCarryForCurrentBlock to accrue carry.
 */
function advanceBlocks(market, numBlocks = 1) {
  for (let i = 0; i < numBlocks; i++) {
    market.currentBlock++;
    updateCarryForCurrentBlock(market);
  }
}

/**
 * updateCarryForCurrentBlock:
 *
 * Human explanation:
 * -------------------
 * This function is used to *accrue OI carry* (funding) each block.
 *
 * 1) We look at the total open interest (OI).
 *    - If total OI is 0, there are no positions, so no carry accrues.
 *
 * 2) We compute the OI imbalance:
 *      imbalance = longOpenInterest - shortOpenInterest
 *    and imbalanceRatio = imbalance / totalOI  ∈ [-1, 1]
 *
 * 3) We compute the carryPerBlock:
 *      carryPerBlock =
 *        BASE_CARRY_RATE_PER_BLOCK * CARRY_SENSITIVITY * imbalanceRatio
 *
 * 4) We then **add this to the cumulativeCarryIndex**:
 *      cumulativeCarryIndex += carryPerBlock
 *
 *    - By convention:
 *        - if imbalanceRatio > 0 (more longs than shorts),
 *          then carryPerBlock > 0 and cumulativeCarryIndex increases.
 *          Later, when we compute carry PnL:
 *            - longs pay (negative PnL),
 *            - shorts receive (positive PnL).
 */
function updateCarryForCurrentBlock(market) {
  const totalOI = getTotalOI(market);
  if (totalOI <= 0) {
    market.lastFundingBlock = market.currentBlock;
    return;
  }

  const imbalance = getImbalance(market);
  const imbalanceRatio = imbalance / totalOI; // -1 .. +1

  const carryPerBlock =
    CONFIG.BASE_CARRY_RATE_PER_BLOCK *
    CONFIG.CARRY_SENSITIVITY *
    imbalanceRatio;

  market.cumulativeCarryIndex += carryPerBlock;
  market.lastFundingBlock = market.currentBlock;
}

/* ============================================================
 * 5. vAMM MATH (OPEN/CLOSE)
 * ============================================================
 *
 * These functions implement the constant-product vAMM math.
 * They are deterministic and only depend on current reserves + order size.
 *
 * General pattern:
 * - For a LONG:
 *   - user puts in quote (notional) to *buy base* from vAMM.
 *   - x (baseReserve) decreases, y (quoteReserve) increases.
 *
 * - For a SHORT:
 *   - user "sells" base (virtually) and gets quote.
 *   - x (baseReserve) increases, y (quoteReserve) decreases.
 *
 * Closing is just doing the opposite side with a fixed base size.
 */

/**
 * simulateOpenLong(market, quoteIn):
 *
 * - User wants to open a long with notional = quoteIn.
 * - They pay quoteIn into the vAMM and receive some baseOut.
 *
 * Math:
 * - current reserves: x, y, k = x*y.
 * - newQuoteReserve = y + quoteIn.
 * - newBaseReserve  = k / newQuoteReserve.
 * - baseOut         = x - newBaseReserve.
 * - avgPrice        = quoteIn / baseOut.
 */
function simulateOpenLong(market, quoteIn) {
  const x = market.baseReserve;
  const y = market.quoteReserve;
  const k = market.k;

  const newQuoteReserve = y + quoteIn;
  const newBaseReserve = k / newQuoteReserve;
  const baseOut = x - newBaseReserve;

  if (baseOut <= 0) {
    throw new Error("Open long amount too small or pool exhausted");
  }

  const avgPrice = quoteIn / baseOut;
  return { baseOut, avgPrice, newBaseReserve, newQuoteReserve };
}

/**
 * simulateOpenShort(market, quoteOut):
 *
 * - User wants to open a short with notional = quoteOut.
 * - They "sell" baseIn to vAMM and receive quoteOut.
 *
 * Math:
 * - current reserves: x, y, k = x*y.
 * - newQuoteReserve = y - quoteOut.
 * - newBaseReserve  = k / newQuoteReserve.
 * - baseIn          = newBaseReserve - x. (baseReserve increases)
 * - avgPrice        = quoteOut / baseIn.
 */
function simulateOpenShort(market, quoteOut) {
  const x = market.baseReserve;
  const y = market.quoteReserve;
  const k = market.k;

  if (quoteOut >= y) throw new Error("Notional too large for pool");

  const newQuoteReserve = y - quoteOut;
  const newBaseReserve = k / newQuoteReserve;
  const baseIn = newBaseReserve - x;

  if (baseIn <= 0) {
    throw new Error("Open short amount too small or invalid");
  }

  const avgPrice = quoteOut / baseIn;
  return { baseIn, avgPrice, newBaseReserve, newQuoteReserve };
}

/**
 * simulateCloseLong(market, baseSize):
 *
 * - Position is long baseSize.
 * - To close, they must sell baseSize to the vAMM and receive quoteOut.
 *
 * Math:
 * - newBaseReserve  = x + baseSize.
 * - newQuoteReserve = k / newBaseReserve.
 * - quoteOut        = y - newQuoteReserve.
 * - avgPrice        = quoteOut / baseSize.
 */
function simulateCloseLong(market, baseSize) {
  const x = market.baseReserve;
  const y = market.quoteReserve;
  const k = market.k;

  const newBaseReserve = x + baseSize;
  const newQuoteReserve = k / newBaseReserve;
  const quoteOut = y - newQuoteReserve;

  const avgPrice = quoteOut / baseSize;
  return { quoteOut, avgPrice, newBaseReserve, newQuoteReserve };
}

/**
 * simulateCloseShort(market, baseSize):
 *
 * - Position is short baseSize.
 * - To close, they must buy baseSize from vAMM and pay quoteIn.
 *
 * Math:
 * - newBaseReserve  = x - baseSize.
 * - newQuoteReserve = k / newBaseReserve.
 * - quoteIn         = newQuoteReserve - y.
 * - avgPrice        = quoteIn / baseSize.
 */
function simulateCloseShort(market, baseSize) {
  const x = market.baseReserve;
  const y = market.quoteReserve;
  const k = market.k;

  if (baseSize >= x) throw new Error("Closing more base than pool has");

  const newBaseReserve = x - baseSize;
  const newQuoteReserve = k / newBaseReserve;
  const quoteIn = newQuoteReserve - y;

  const avgPrice = quoteIn / baseSize;
  return { quoteIn, avgPrice, newBaseReserve, newQuoteReserve };
}

/* ============================================================
 * 6. OI & OPEN FEES
 * ============================================================
 *
 * Functions for:
 * - adjusting open interest when positions open/close
 * - applying open fees based on notional and OI skew
 */

/** Increase open interest by notionalDelta for long or short side. */
function increaseOI(market, isLong, notionalDelta) {
  if (isLong) market.longOpenInterest += notionalDelta;
  else market.shortOpenInterest += notionalDelta;
}

/** Decrease open interest by notionalDelta for long or short side. */
function decreaseOI(market, isLong, notionalDelta) {
  if (isLong) market.longOpenInterest -= notionalDelta;
  else market.shortOpenInterest -= notionalDelta;
}

/**
 * getEffectiveOpenFeeRate(state)
 *
 * Human explanation:
 * -------------------
 * This returns the **effective fee rate** for opening a position,
 * including the OI skew multiplier.
 *
 * Mode 3 uses this feeRate as a constant fr in the formula:
 *   totalToUse = margin + fee = margin + margin * leverage * fr
 *   => margin = totalToUse / (1 + leverage * fr)
 */
function getEffectiveOpenFeeRate(state) {
  const market = state.market;
  const base = CONFIG.BASE_OPEN_FEE_RATE;

  const totalOI = getTotalOI(market);
  if (totalOI <= 0) {
    // no skew if no OI
    return base;
  }

  const imbalanceRatio = Math.abs(getImbalance(market) / totalOI); // 0..1
  const multiplier = 1 + imbalanceRatio * CONFIG.OI_SKEW_FEE_MULTIPLIER;
  return base * multiplier;
}

/**
 * applyOpenFee(state, notional):
 *
 * Human explanation:
 * -------------------
 * This function is used whenever we open a position, to compute and
 * allocate trading fees.
 *
 * 1) Base fee:
 *      baseFee = notional * BASE_OPEN_FEE_RATE
 *
 * 2) OI skew adjustment:
 *    - If there is an imbalance between long and short OI, we adjust fee:
 *        imbalanceRatio = |longOI - shortOI| / totalOI
 *        adjustedFee = baseFee * (1 + imbalanceRatio * OI_SKEW_FEE_MULTIPLIER)
 *
 *    - Intuition:
 *        - If one side is crowded (big imbalance), opening more on that side
 *          should be more expensive (or we just want a behavior change).
 *
 * 3) We then allocate this adjustedFee between:
 *      - insuranceFund
 *      - protocolFees
 *
 * 4) We return the adjustedFee so that the caller can subtract it from margin.
 */
function applyOpenFee(state, notional) {
  const market = state.market;
  const baseFee = notional * CONFIG.BASE_OPEN_FEE_RATE;

  const totalOI = getTotalOI(market);
  let adjustedFee = baseFee;
  if (totalOI > 0) {
    const imbalanceRatio = Math.abs(getImbalance(market) / totalOI);
    adjustedFee = baseFee * (1 + imbalanceRatio * CONFIG.OI_SKEW_FEE_MULTIPLIER);
  }

  allocateFees(state, adjustedFee);
  return adjustedFee;
}

/* ============================================================
 * 7. OPEN POSITION - MODE 3
 * ============================================================
 *
 * openPosition(state, { userId, isLong, totalToUse, leverage })
 *
 * MODE 3  (All-in with exact leverage)
 * ====================================
 *
 * HUMAN EXPLANATION (INTUITION):
 * ------------------------------
 *
 * We want the user to be able to say:
 *   "I want to use THIS MUCH money for this trade (totalToUse),
 *    and I want THIS leverage."
 *
 * - `totalToUse` is the **full amount taken from the wallet** for this trade:
 *      totalToUse = margin + trading fee
 *
 * - `leverage` is the exact multiple they want on their margin:
 *      notional = margin * leverage
 *
 * The engine:
 * -----------
 * - We compute an **effective fee rate** (feeRate) that includes OI skew.
 *
 *   Let:
 *      T  = totalToUse
 *      L  = leverage
 *      fr = feeRate
 *      m  = effective margin (what we lock for risk)
 *      N  = notional (position size)
 *      fee = trading fee
 *
 * - Equations:
 *      T = m + fee
 *      fee = N * fr
 *      N = m * L
 *
 *   Substitute:
 *      T = m + (m * L * fr)
 *      T = m * (1 + L * fr)
 *
 *   Solve for m:
 *      m = T / (1 + L * fr)
 *      N = m * L
 *      fee = N * fr
 *
 * - This guarantees:
 *      m + fee = T  (we use exactly totalToUse from wallet)
 *      N / m = L    (leverage is exactly what user chose)
 *
 * STEPS INSIDE THIS FUNCTION:
 * ---------------------------
 *  1) Validate inputs (totalToUse > 0, leverage > 0).
 *  2) Compute effective fee rate (base fee + OI skew).
 *  3) Solve Mode 3 formulas:
 *         margin   = totalToUse / (1 + leverage * feeRate)
 *         notional = margin * leverage
 *         fee      = notional * feeRate
 *  4) Check user has at least totalToUse in wallet.
 *  5) Deduct totalToUse from wallet:
 *         - add margin to tradeFund
 *         - split fee between insuranceFund and protocolFees
 *  6) Check initial margin ratio <= MAX_LEVERAGE.
 *  7) Advance blocks (optional no-op) to keep carry index up to date.
 *  8) Execute the vAMM trade with `notional`:
 *         - if long: simulateOpenLong
 *         - if short: simulateOpenShort
 *     This gives us:
 *         baseSize, entryPrice, new reserves.
 *  9) Update market reserves and invariant k.
 * 10) Create a Position object with:
 *         - baseSize
 *         - entryPrice
 *         - margin (the Mode 3 effective margin)
 *         - carrySnapshot = current cumulativeCarryIndex
 * 11) Store the position in state and increase OI by entryNotional.
 * 12) Return the position plus some extra fields (notional, fee, feeRate, etc.).
 */

function openPosition(state, { userId, isLong, totalToUse, leverage }) {
  // Step 1: Input validation
  if (totalToUse <= 0) throw new Error("totalToUse must be > 0");
  if (leverage <= 0) throw new Error("Leverage must be > 0");

  const market = state.market;
  const funds = state.funds;

  // Step 2: Compute effective fee rate (base fee + OI skew)
  //
  // This feeRate is a single number fr that we will use in the Mode 3 formula:
  //   m = T / (1 + L * fr).
  //
  const feeRate = getEffectiveOpenFeeRate(state);

  // Step 3: Solve Mode 3 formulas (margin, notional, fee)
  //
  // Given:
  //   T = totalToUse, L = leverage, fr = feeRate
  //
  //   T = m + fee
  //     = m + (m * L * fr)
  //     = m * (1 + L * fr)
  //
  // => m = T / (1 + L * fr)
  //
  const margin = totalToUse / (1 + leverage * feeRate);
  const notional = margin * leverage;
  const fee = notional * feeRate;

  // (Optional sanity check; can be commented out in prod)
  // const recomposed = margin + fee;
  // if (Math.abs(recomposed - totalToUse) > 1e-8) {
  //   console.warn("Mode 3 numeric drift:", recomposed, totalToUse);
  // }

  // Step 4: Check user has enough balance for totalToUse
  //
  // totalToUse is the full amount we will remove from the wallet
  // (margin + fee combined).
  //
  ensureUser(funds, userId);
  const user = funds.users[userId];
  if (user.wallet < totalToUse) {
    throw new Error("Insufficient wallet balance for totalToUse (margin + fee)");
  }

  // Step 5: Deduct totalToUse from wallet, split into margin + fee
  //
  // - margin goes to tradeFund (risk capital)
  // - fee is split into insuranceFund + protocolFees
  //
  user.wallet -= totalToUse;

  funds.tradeFund += margin;
  const feeToInsurance = fee * CONFIG.FEE_SPLIT.TO_INSURANCE;
  const feeToProtocol = fee * CONFIG.FEE_SPLIT.TO_PROTOCOL;
  funds.insuranceFund += feeToInsurance;
  funds.protocolFees += feeToProtocol;

  // Step 6: max leverage check


if (leverage > CONFIG.MAX_LEVERAGE) {
  throw new Error(`Leverage too high, max is ${CONFIG.MAX_LEVERAGE}x`);
}

  // Step 7: Optionally advance blocks (keep carry index synced)
  //
  // In many setups this is a no-op (numBlocks = 0), but logically we
  // like to ensure that carrySnapshot is taken after any funding accrual.
  //
  advanceBlocks(market, 0);

  // Step 8: Simulate vAMM trade for this notional
  //
  // We now execute the trade on the virtual AMM:
  //  - If long: user spends notional quote, receives baseOut.
  //  - If short: user "sells" baseIn virtually, receives notional quoteOut.
  //
  let baseSize, entryPrice, newBaseReserve, newQuoteReserve;
  if (isLong) {
    const r = simulateOpenLong(market, notional);
    baseSize = r.baseOut;
    entryPrice = r.avgPrice;
    newBaseReserve = r.newBaseReserve;
    newQuoteReserve = r.newQuoteReserve;
  } else {
    const r = simulateOpenShort(market, notional);
    baseSize = r.baseIn;
    entryPrice = r.avgPrice;
    newBaseReserve = r.newBaseReserve;
    newQuoteReserve = r.newQuoteReserve;
  }

  // Step 9: Update vAMM reserves & invariant
  market.baseReserve = newBaseReserve;
  market.quoteReserve = newQuoteReserve;
  market.k = newBaseReserve * newQuoteReserve;

  // Step 10: Create the Position object
  //
  // We store:
  //   - baseSize       (how many base units the user is long/short)
  //   - entryPrice     (avg fill price)
  //   - margin         (effective margin from Mode 3)
  //   - carrySnapshot  (cumulativeCarryIndex at open, for carry PnL later)
  //
  const positionId = state.nextPositionId++;
  const position = createPosition({
    id: positionId,
    userId,
    isLong,
    baseSize,
    entryPrice,
    margin, // Mode 3 effective margin
    carrySnapshot: market.cumulativeCarryIndex,
    openBlock: market.currentBlock,
  });

  state.positions[positionId] = position;

  // Step 11: Increase open interest by the entry notional
  increaseOI(market, isLong, position.entryNotional);

  // Step 12: Return position plus useful derived info
  //
  // We include notional, fee, feeRate, totalToUse, and effectiveLeverage
  // so the caller (UI / simulation) can display them without recomputing.
  //
  const effectiveLeverage = position.entryNotional / margin;

  return {
    ...position,
    notional,
    fee,
    feeRate,
    totalToUse,
    effectiveLeverage,
  };
}

/* ============================================================
 * 8. SIMULATE "IF CLOSED NOW" (for liquidation)
 * ============================================================
 *
 * simulateEquityIfClosedNow(state, positionId)
 *
 * Human explanation:
 * -------------------
 * This function answers the question:
 *   "If I fully closed this position **right now** on the vAMM:
 *      - what average closing price would I get?
 *      - what is my trading PnL?
 *      - what is my carry PnL?
 *      - what is my total PnL?
 *      - what is my resulting equity? (margin + PnL)"
 *
 * We do NOT mutate any state here (no reserves change, no OI change).
 * This is used by isLiquidatable(...) to decide if a position can
 * be liquidated.
 */
function simulateEquityIfClosedNow(state, positionId) {
  const market = state.market;
  const position = state.positions[positionId];
  if (!position || position.status !== "OPEN") {
    throw new Error("Position not found or not open");
  }

  // 1) Simulate closing on vAMM to get closeNotional & avgClosePrice
  let closeNotional, avgClosePrice;
  if (position.isLong) {
    const { quoteOut, avgPrice } = simulateCloseLong(market, position.baseSize);
    closeNotional = quoteOut;
    avgClosePrice = avgPrice;
  } else {
    const { quoteIn, avgPrice } = simulateCloseShort(market, position.baseSize);
    closeNotional = quoteIn;
    avgClosePrice = avgPrice;
  }

  // 2) Trading PnL (no carry yet)
  //    For long:  profit if closeNotional > entryNotional
  //    For short: profit if closeNotional < entryNotional
  let pnlTrade;
  if (position.isLong) {
    pnlTrade = closeNotional - position.entryNotional;
  } else {
    pnlTrade = position.entryNotional - closeNotional;
  }

  // 3) Carry PnL (trailing OI carry):
  //    - We use deltaCarry = currentIndex - carrySnapshot.
  //    - We multiply by a notionalNow = baseSize * markPrice.
  //    - sideSign:
  //        - longs: -1  (they pay when index increased)
  //        - shorts: +1 (they receive when index increased)
  const markPrice = getMarkPrice(market);
  const notionalNow = position.baseSize * markPrice;
  const deltaCarry = market.cumulativeCarryIndex - position.carrySnapshot;
  const sideSign = position.isLong ? -1 : +1;
  const carryPnl = sideSign * notionalNow * deltaCarry;

  // 4) Total PnL and equityIfClosed:
  const totalPnl = pnlTrade + carryPnl;
  const equityIfClosed = position.margin + totalPnl;

  return {
    closeNotional,
    avgClosePrice,
    pnlTrade,
    carryPnl,
    totalPnl,
    equityIfClosed,
  };
}

/* ============================================================
 * 9. LIQUIDATION CHECK
 * ============================================================
 *
 * isLiquidatable(state, positionId)
 *
 * Human explanation (intuition):
 * ------------------------------
 *
 * We want to liquidate a position **only** when the user is losing
 * more than their **margin minus buffer**.
 *
 * Think of:
 *   - margin = how much the user put at risk for this position.
 *   - buffer = a safety cushion, defined as a % of margin (based on leverage).
 *
 * Example:
 * --------
 *   - User margin M = 100
 *   - Buffer ratio = 10% (0–10x leverage bucket)
 *   - Buffer amount = 10% of margin = 10
 *
 * That means:
 *   - The user can "burn" up to 90 of that margin before liquidation.
 *   - We allow the position to run as long as **loss ≤ 90**.
 *   - Once the loss is **greater than 90**, only ≤10 is left of the margin,
 *     and we consider that unsafe.
 *
 * In other words:
 *   - If the user closed the position **right now** and:
 *        - their loss is more than (margin - buffer), i.e. > 90,
 *        - or said differently: equity left after close < 10% of margin,
 *     then we allow liquidation.
 *
 * So the liquidation condition is:
 *
 *      loss_after_close > (margin - buffer)
 *  ⇔  loss_after_close > margin * (1 - bufferRatio)
 *  ⇔  equityAfterClose < margin * bufferRatio
 *
 * Where:
 *   - equityAfterClose = margin + PnL_if_closed_now
 *   - bufferRatio is 0.10, 0.20, 0.30 depending on leverage bucket.
 *
 * Step-by-step in this function:
 * ------------------------------
 *
 *  1) Basic checks:
 *       - position must exist and be OPEN.
 *
 *  2) Same-block protection:
 *       - We never liquidate in the same block where the position was opened
 *         (to avoid instant liq due to tiny math noise).
 *
 *  3) Simulate "if closed now":
 *       - We simulate fully closing the position on the vAMM,
 *         and get equityAfterClose (margin + PnL if we close right now).
 *
 *  4) Compute current leverage:
 *       - Use current markPrice:
 *            notionalNow = baseSize * markPrice
 *            leverage    = notionalNow / margin
 *
 *  5) Get bufferRatio from leverage:
 *       - From your leverage buckets (0–10x → 10%, 10–20x → 20%, ...).
 *       - Interpret bufferRatio as "minimum equity % of margin".
 *
 *  6) Compute loss and allowed loss:
 *       - currentLoss = max(0, margin - equityAfterClose)
 *       - allowedLoss = margin * (1 - bufferRatio)
 *
 *       Intuition:
 *         - currentLoss = how much of the margin is already gone.
 *         - allowedLoss = how much margin we allow to be burned
 *           before liquidating (e.g. 90% of margin for 10% buffer).
 *
 *  7) Compare with a small epsilon:
 *       - If currentLoss is clearly greater than allowedLoss
 *         (by more than a tiny epsilon), the position is liquidable.
 *       - Otherwise, it's still safe.
 */

function isLiquidatable(state, positionId) {
  const market = state.market;
  const position = state.positions[positionId];

  // Step 1: Basic existence / status check
  if (!position || position.status !== "OPEN") {
    return false;
  }

  // Step 2: Same-block protection
  // We do not allow a position to be liquidated in the same block it was opened.
  if (position.openBlock === market.currentBlock) {
    return false;
  }

  // Step 3: Simulate "if closed now" to get equity after close
  //
  // simulateEquityIfClosedNow(...) gives us, among other things:
  //   equityIfClosed = margin + PnL_if_closed_now
  //
  const { equityIfClosed } = simulateEquityIfClosedNow(state, positionId);

  // Step 4: Compute current leverage using mark price
  //
  // markPrice   = current vAMM price
  // notionalNow = baseSize * markPrice
  // leverage    = notionalNow / margin
  //
  const markPrice = getMarkPrice(market);
  const notionalNow = position.baseSize * markPrice;
  const leverage = notionalNow / position.margin;

  // Step 5: Get buffer ratio from leverage bucket
  //
  // bufferRatio is "minimum equity % of margin":
  //   - 0–10x  → 0.10 (10% of margin must remain)
  //   - 10–20x → 0.20 (20% must remain)
  //   - >20x   → 0.30 (30% must remain)
  //
  const bufferRatio = getLiquidationBufferRatio(leverage);

  // Step 6: Compute current loss and allowed loss
  //
  // margin M = position.margin
  // equity E = equityIfClosed
  //
  // currentLoss = max(0, M - E)
  // allowedLoss = M * (1 - bufferRatio)
  //
  // Example:
  //   M = 100, bufferRatio = 0.10
  //   allowedLoss = 100 * (1 - 0.10) = 90
  //
  //   We liquidate only if currentLoss > 90 (so equity < 10).
  //
  const M = position.margin;
  const E = equityIfClosed;

  const currentLoss = Math.max(0, M - E);
  const allowedLoss = M * (1 - bufferRatio);

  // Step 7: Compare with epsilon to avoid float dust issues
  //
  // If currentLoss is greater than allowedLoss by more than EPS,
  // the position is liquidable.
  //
  const EPS = 1e-6;

  if (currentLoss > allowedLoss + EPS) {
    // Interpretation:
    //   The user has lost more than (margin - buffer),
    //   or equivalently, equity after close < bufferRatio * margin.
    return true;
  }

  // Otherwise, still safe.
  return false;
}

/* ============================================================
 * 10. CLOSE POSITION (USER-INITIATED)
 * ============================================================
 *
 * closePosition(state, positionId)
 *
 * Human explanation:
 * -------------------
 * This is the normal user close, for full position size:
 *
 * Steps:
 *  1) Simulate and then actually execute the vAMM close:
 *       - For long: simulateCloseLong(baseSize).
 *       - For short: simulateCloseShort(baseSize).
 *     This moves the vAMM reserves and gives us closeNotional & avgClosePrice.
 *
 *  2) Compute trading PnL from entryNotional vs closeNotional.
 *
 *  3) Compute carry PnL using deltaCarry and current mark price.
 *
 *  4) totalPnl = pnlTrade + carryPnl.
 *
 *  5) Decrease open interest by entryNotional.
 *
 *  6) Payout:
 *       payout = margin + totalPnl
 *     - If payout >= 0: we pay that from tradeFund to user's wallet.
 *     - If payout < 0: user is effectively bankrupt on this position,
 *       the negative part is "bad debt" that must be covered by
 *       insuranceFund + tradeFund via coverBadDebt().
 */
function closePosition(state, positionId) {
  const market = state.market;
  const position = state.positions[positionId];
  if (!position || position.status !== "OPEN") {
    throw new Error("Position not found or not open");
  }
  const userId = position.userId;

  advanceBlocks(market, 0); // optional, keep carry fresh

  let closeNotional, avgClosePrice, newBaseReserve, newQuoteReserve;
  if (position.isLong) {
    const r = simulateCloseLong(market, position.baseSize);
    closeNotional = r.quoteOut;
    avgClosePrice = r.avgPrice;
    newBaseReserve = r.newBaseReserve;
    newQuoteReserve = r.newQuoteReserve;
  } else {
    const r = simulateCloseShort(market, position.baseSize);
    closeNotional = r.quoteIn;
    avgClosePrice = r.avgPrice;
    newBaseReserve = r.newBaseReserve;
    newQuoteReserve = r.newQuoteReserve;
  }

  // Update vAMM reserves
  market.baseReserve = newBaseReserve;
  market.quoteReserve = newQuoteReserve;
  market.k = newBaseReserve * newQuoteReserve;

  // Trading PnL
  let pnlTrade;
  if (position.isLong) {
    pnlTrade = closeNotional - position.entryNotional;
  } else {
    pnlTrade = position.entryNotional - closeNotional;
  }

  // Carry PnL
  const markPrice = getMarkPrice(market);
  const notionalNow = position.baseSize * markPrice;
  const deltaCarry = market.cumulativeCarryIndex - position.carrySnapshot;
  const sideSign = position.isLong ? -1 : +1;
  const carryPnl = sideSign * notionalNow * deltaCarry;

  const totalPnl = pnlTrade + carryPnl;
  position.realizedPnl += totalPnl;

  // Reduce open interest
  decreaseOI(market, position.isLong, position.entryNotional);

  // Payout from tradeFund to user wallet
  const payout = position.margin + totalPnl;
  if (payout >= 0) {
    moveTradeFundToWallet(state, userId, payout);
  } else {
    coverBadDebt(state, -payout);
  }

  position.status = "CLOSED";
  return { positionId, userId, avgClosePrice, pnlTrade, carryPnl, totalPnl };
}

/* ============================================================
 * 11. LIQUIDATE POSITION (KEEPER)
 * ============================================================
 *
 * liquidatePosition(state, positionId, liquidatorId)
 *
 * Human explanation:
 * -------------------
 * This function is called by a liquidator (keeper/bot) to forcibly
 * close a position that is **already** liquidable.
 *
 * Steps:
 *  1) We first check isLiquidatable(...) — if false, revert.
 *
 *  2) We then do basically the same closing logic as closePosition:
 *       - simulate close on vAMM (and update reserves)
 *       - compute trading PnL and carry PnL
 *       - totalPnl = pnlTrade + carryPnl
 *       - equityIfClosed = margin + totalPnl
 *
 *  3) We compute a liquidation fee:
 *       liqFee = closeNotional * LIQUIDATION_FEE_RATIO
 *
 *  4) We handle two cases:
 *
 *       Case A: equityIfClosed >= 0
 *         - user has some equity left.
 *         - userPayout = equityIfClosed - liqFee
 *         - we pay userPayout (if positive) to user from tradeFund.
 *         - we pay liqFee from tradeFund to liquidator.
 *
 *       Case B: equityIfClosed < 0
 *         - user is bankrupt; there is bad debt = -equityIfClosed + liqFee
 *         - we call coverBadDebt(...) to pay that from insurance+tradeFund.
 *         - we still pay liqFee to liquidator (from tradeFund if possible).
 *
 *  5) Position status is set to "LIQUIDATED".
 */
function liquidatePosition(state, positionId, liquidatorId) {
  const market = state.market;
  const position = state.positions[positionId];
  if (!position || position.status !== "OPEN") {
    throw new Error("Position not found or not open");
  }

  if (!isLiquidatable(state, positionId)) {
    throw new Error("Position not liquidatable");
  }

  const userId = position.userId;
  advanceBlocks(market, 0);

  let closeNotional, avgClosePrice, newBaseReserve, newQuoteReserve;
  if (position.isLong) {
    const r = simulateCloseLong(market, position.baseSize);
    closeNotional = r.quoteOut;
    avgClosePrice = r.avgPrice;
    newBaseReserve = r.newBaseReserve;
    newQuoteReserve = r.newQuoteReserve;
  } else {
    const r = simulateCloseShort(market, position.baseSize);
    closeNotional = r.quoteIn;
    avgClosePrice = r.avgPrice;
    newBaseReserve = r.newBaseReserve;
    newQuoteReserve = r.newQuoteReserve;
  }

  // Update vAMM
  market.baseReserve = newBaseReserve;
  market.quoteReserve = newQuoteReserve;
  market.k = newBaseReserve * newQuoteReserve;

  // Trading PnL
  let pnlTrade;
  if (position.isLong) {
    pnlTrade = closeNotional - position.entryNotional;
  } else {
    pnlTrade = position.entryNotional - closeNotional;
  }

  // Carry PnL
  const markPrice = getMarkPrice(market);
  const notionalNow = position.baseSize * markPrice;
  const deltaCarry = market.cumulativeCarryIndex - position.carrySnapshot;
  const sideSign = position.isLong ? -1 : +1;
  const carryPnl = sideSign * notionalNow * deltaCarry;

  const totalPnl = pnlTrade + carryPnl;
  position.realizedPnl += totalPnl;

  // Reduce OI
  decreaseOI(market, position.isLong, position.entryNotional);

  // Liquidation fee
  const liqFee = closeNotional * CONFIG.LIQUIDATION_FEE_RATIO;

  // Equity if closed
  const equityIfClosed = position.margin + totalPnl;

  if (equityIfClosed >= 0) {
    const userPayout = equityIfClosed - liqFee;
    if (userPayout > 0) {
      moveTradeFundToWallet(state, userId, userPayout);
    }
    payLiquidationReward(state, liquidatorId, liqFee);
  } else {
    const badDebt = -equityIfClosed + liqFee;
    coverBadDebt(state, badDebt);
    payLiquidationReward(state, liquidatorId, liqFee);
  }

  position.status = "LIQUIDATED";

  return {
    positionId,
    userId,
    liquidatorId,
    avgClosePrice,
    pnlTrade,
    carryPnl,
    totalPnl,
    equityIfClosed,
    liqFee,
  };
}

/* ============================================================
 * 12. EXAMPLE USAGE (for local testing)
 * ============================================================
 *
 * Uncomment to play around in Node:
 */

// const state = createEngineState();
// deposit(state, "alice", 10_000);
// const pos = openPosition(state, { userId: "alice", isLong: true, totalToUse: 1_000, leverage: 5 });
// advanceBlocks(state.market, 100); // let carry accrue
// console.log("Liquidable?", isLiquidatable(state, pos.id));
// const res = closePosition(state, pos.id);
// console.log("Close result:", res);

// perpEngine.js (add this at the very end)

export {
  createEngineState,
  deposit,
  withdraw,
  openPosition,
  closePosition,
  isLiquidatable,
  liquidatePosition,
  advanceBlocks,
  getMarkPrice,
  simulateEquityIfClosedNow,   // ⬅️ add this line
};
