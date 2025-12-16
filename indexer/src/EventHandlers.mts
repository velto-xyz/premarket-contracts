import { PerpFactory, PerpEngine } from "generated";
import BigNumber from "bignumber.js";
import { getAddress } from "viem";

console.log("[Indexer] EventHandlers loaded");

// EIP-55 checksum utility
function toChecksumAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    console.error("[Checksum] Invalid address:", address);
    return address;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

console.log("[Indexer] Supabase config:", { url: SUPABASE_URL, hasKey: !!SUPABASE_KEY });

// REST API helpers
async function supabaseUpsert(table: string, data: any): Promise<{ error: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { error: "not configured" };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `${res.status}: ${err}` };
  }
  return { error: null };
}

async function supabaseUpdate(table: string, data: any, column: string, value: string): Promise<{ error: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { error: "not configured" };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `${res.status}: ${err}` };
  }
  return { error: null };
}

const supabaseEnabled = !!(SUPABASE_URL && SUPABASE_KEY);
if (supabaseEnabled) {
  console.log("[Indexer] Supabase REST configured");
} else {
  console.log("[Indexer] Supabase NOT configured");
}

// Factory: Register new PerpEngine contracts dynamically
PerpFactory.MarketCreated.contractRegister(({ event, context }) => {
  context.addPerpEngine(event.params.engine);
});

PerpFactory.MarketCreated.handler(async ({ event, context }) => {
  context.Market.set({
    id: event.params.marketIndex.toString(),
    engine: toChecksumAddress(event.params.engine),
    market: toChecksumAddress(event.params.market),
    collateralToken: toChecksumAddress(event.params.collateralToken),
    createdAt: new Date(event.block.timestamp * 1000),
    createdBlock: BigInt(event.block.number),
  });
});

// PerpEngine: Index position events
PerpEngine.PositionOpened.handler(async ({ event, context }) => {
  const price = new BigNumber(event.params.entryPrice.toString()).div(1e18);
  const baseSize = new BigNumber(event.params.baseSize.toString()).div(1e18);
  const margin = new BigNumber(event.params.margin.toString()).div(1e18);
  const leverage = new BigNumber(event.params.leverage.toString()).div(1e18);
  const notional = price.times(baseSize);

  const id = `${event.block.hash}-${event.logIndex}`;
  const engine = toChecksumAddress(event.srcAddress);
  const userAddress = toChecksumAddress(event.params.user);
  const timestamp = new Date(event.block.timestamp * 1000);

  // Store in Envio
  context.Trade.set({
    id,
    engine,
    user: userAddress,
    positionId: event.params.positionId,
    eventType: "open",
    price,
    baseSize,
    margin,
    notional,
    pnl: undefined,
    isLong: event.params.isLong,
    timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.block.hash,
  });

  context.PricePoint.set({
    id: `${engine}-${event.block.number}-${event.logIndex}`,
    engine,
    price,
    timestamp,
    blockNumber: BigInt(event.block.number),
  });

  // Update user holdings aggregate
  const holdingId = `${userAddress}-${engine}`;
  const existingHolding = await context.UserHolding.get(holdingId);

  context.UserHolding.set({
    id: holdingId,
    user: userAddress,
    engine,
    openPositionCount: (existingHolding?.openPositionCount ?? 0) + 1,
    totalTrades: (existingHolding?.totalTrades ?? 0) + 1,
    totalVolume: new BigNumber(existingHolding?.totalVolume?.toString() ?? "0").plus(notional),
    realizedPnl: new BigNumber(existingHolding?.realizedPnl?.toString() ?? "0"),
    lastTradeAt: timestamp,
  });

  // Push to Supabase
  if (supabaseEnabled) {
    console.log("[Supabase] Pushing PositionOpened:", { id, engine, userAddress });

    const [tradeRes, positionRes, walletRes] = await Promise.all([
      supabaseUpsert("trades", {
        id,
        engine,
        user_address: userAddress,
        position_id: event.params.positionId.toString(),
        event_type: "open",
        is_long: event.params.isLong,
        price: price.toString(),
        base_size: baseSize.toString(),
        margin: margin.toString(),
        notional: notional.toString(),
        pnl: null,
        block_number: event.block.number,
        tx_hash: event.block.hash,
        timestamp: timestamp.toISOString(),
      }),
      supabaseUpsert("positions", {
        id: event.params.positionId.toString(),
        engine,
        user_address: userAddress,
        is_long: event.params.isLong,
        entry_price: price.toString(),
        base_size: baseSize.toString(),
        margin: margin.toString(),
        leverage: leverage.toString(),
        status: "open",
        opened_at: timestamp.toISOString(),
        closed_at: null,
      }),
      supabaseUpsert("wallets", { address: userAddress }),
    ]);

    if (tradeRes.error) console.error("[Supabase] trades error:", tradeRes.error);
    if (positionRes.error) console.error("[Supabase] positions error:", positionRes.error);
    if (walletRes.error) console.error("[Supabase] wallets error:", walletRes.error);
    if (!tradeRes.error && !positionRes.error) console.log("[Supabase] PositionOpened pushed successfully");
  }
});

PerpEngine.PositionClosed.handler(async ({ event, context }) => {
  const price = new BigNumber(event.params.avgClosePrice.toString()).div(1e18);
  const pnl = new BigNumber(event.params.totalPnl.toString()).div(1e18);

  const id = `${event.block.hash}-${event.logIndex}`;
  const engine = toChecksumAddress(event.srcAddress);
  const userAddress = toChecksumAddress(event.params.user);
  const timestamp = new Date(event.block.timestamp * 1000);

  // Store in Envio
  context.Trade.set({
    id,
    engine,
    user: userAddress,
    positionId: event.params.positionId,
    eventType: "close",
    price,
    baseSize: new BigNumber(0),
    margin: new BigNumber(0),
    notional: new BigNumber(0),
    pnl,
    isLong: false,
    timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.block.hash,
  });

  context.PricePoint.set({
    id: `${engine}-${event.block.number}-${event.logIndex}`,
    engine,
    price,
    timestamp,
    blockNumber: BigInt(event.block.number),
  });

  // Update user holdings aggregate
  const holdingId = `${userAddress}-${engine}`;
  const existingHolding = await context.UserHolding.get(holdingId);

  if (existingHolding) {
    context.UserHolding.set({
      ...existingHolding,
      openPositionCount: Math.max(0, existingHolding.openPositionCount - 1),
      totalTrades: existingHolding.totalTrades + 1,
      realizedPnl: new BigNumber(existingHolding.realizedPnl.toString()).plus(pnl),
      lastTradeAt: timestamp,
    });
  }

  // Push to Supabase
  if (supabaseEnabled) {
    console.log("[Supabase] Pushing PositionClosed:", { id, engine, userAddress });

    const [tradeRes, positionRes] = await Promise.all([
      supabaseUpsert("trades", {
        id,
        engine,
        user_address: userAddress,
        position_id: event.params.positionId.toString(),
        event_type: "close",
        is_long: false,
        price: price.toString(),
        base_size: "0",
        margin: "0",
        notional: "0",
        pnl: pnl.toString(),
        block_number: event.block.number,
        tx_hash: event.block.hash,
        timestamp: timestamp.toISOString(),
      }),
      supabaseUpdate("positions", {
        status: "closed",
        closed_at: timestamp.toISOString(),
      }, "id", event.params.positionId.toString()),
    ]);

    if (tradeRes.error) console.error("[Supabase] trades error:", tradeRes.error);
    if (positionRes.error) console.error("[Supabase] positions error:", positionRes.error);
    if (!tradeRes.error && !positionRes.error) console.log("[Supabase] PositionClosed pushed successfully");
  }
});

PerpEngine.PositionLiquidated.handler(async ({ event, context }) => {
  const id = `${event.block.hash}-${event.logIndex}`;
  const engine = toChecksumAddress(event.srcAddress);
  const userAddress = toChecksumAddress(event.params.user);
  const timestamp = new Date(event.block.timestamp * 1000);

  // Store in Envio
  context.Trade.set({
    id,
    engine,
    user: userAddress,
    positionId: event.params.positionId,
    eventType: "liquidate",
    price: new BigNumber(0),
    baseSize: new BigNumber(0),
    margin: new BigNumber(0),
    notional: new BigNumber(0),
    pnl: undefined,
    isLong: false,
    timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.block.hash,
  });

  // Update user holdings aggregate
  const holdingId = `${userAddress}-${engine}`;
  const existingHolding = await context.UserHolding.get(holdingId);

  if (existingHolding) {
    context.UserHolding.set({
      ...existingHolding,
      openPositionCount: Math.max(0, existingHolding.openPositionCount - 1),
      totalTrades: existingHolding.totalTrades + 1,
      lastTradeAt: timestamp,
    });
  }

  // Push to Supabase
  if (supabaseEnabled) {
    console.log("[Supabase] Pushing PositionLiquidated:", { id, engine, userAddress });

    const [tradeRes, positionRes] = await Promise.all([
      supabaseUpsert("trades", {
        id,
        engine,
        user_address: userAddress,
        position_id: event.params.positionId.toString(),
        event_type: "liquidate",
        is_long: false,
        price: "0",
        base_size: "0",
        margin: "0",
        notional: "0",
        pnl: null,
        block_number: event.block.number,
        tx_hash: event.block.hash,
        timestamp: timestamp.toISOString(),
      }),
      supabaseUpdate("positions", {
        status: "liquidated",
        closed_at: timestamp.toISOString(),
      }, "id", event.params.positionId.toString()),
    ]);

    if (tradeRes.error) console.error("[Supabase] trades error:", tradeRes.error);
    if (positionRes.error) console.error("[Supabase] positions error:", positionRes.error);
    if (!tradeRes.error && !positionRes.error) console.log("[Supabase] PositionLiquidated pushed successfully");
  }
});
