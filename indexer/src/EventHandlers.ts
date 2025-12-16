import { PerpFactory, PerpEngine } from "generated";

PerpFactory.MarketCreated.contractRegister(({ event, context }) => {
  context.log.info("MarketCreated contractRegister called");
  context.addPerpEngine(event.params.engine);
});

PerpFactory.MarketCreated.handler(async ({ event, context }) => {
  context.log.info("MarketCreated handler called");
  context.Market.set({
    id: event.params.marketIndex.toString(),
    engine: event.params.engine,
    market: event.params.market,
    collateralToken: event.params.collateralToken,
    createdAt: new Date(event.block.timestamp * 1000),
    createdBlock: BigInt(event.block.number),
  });
});

PerpEngine.PositionOpened.handler(async ({ event, context }) => {
  const price = event.params.entryPrice;
  const baseSize = event.params.baseSize;
  const margin = event.params.margin;
  const notional = (price * baseSize) / BigInt(1e18);

  const id = `${event.block.hash}-${event.logIndex}`;
  const engine = event.srcAddress;
  const userAddress = event.params.user;
  const timestamp = new Date(event.block.timestamp * 1000);

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

  const holdingId = `${userAddress}-${engine}`;
  const existingHolding = await context.UserHolding.get(holdingId);

  context.UserHolding.set({
    id: holdingId,
    user: userAddress,
    engine,
    openPositionCount: (existingHolding?.openPositionCount ?? 0) + 1,
    totalTrades: (existingHolding?.totalTrades ?? 0) + 1,
    totalVolume: (existingHolding?.totalVolume ?? BigInt(0)) + notional,
    realizedPnl: existingHolding?.realizedPnl ?? BigInt(0),
    lastTradeAt: timestamp,
  });
});

PerpEngine.PositionClosed.handler(async ({ event, context }) => {
  const price = event.params.avgClosePrice;
  const pnl = event.params.totalPnl;

  const id = `${event.block.hash}-${event.logIndex}`;
  const engine = event.srcAddress;
  const userAddress = event.params.user;
  const timestamp = new Date(event.block.timestamp * 1000);

  context.Trade.set({
    id,
    engine,
    user: userAddress,
    positionId: event.params.positionId,
    eventType: "close",
    price,
    baseSize: BigInt(0),
    margin: BigInt(0),
    notional: BigInt(0),
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

  const holdingId = `${userAddress}-${engine}`;
  const existingHolding = await context.UserHolding.get(holdingId);

  if (existingHolding) {
    context.UserHolding.set({
      ...existingHolding,
      openPositionCount: Math.max(0, existingHolding.openPositionCount - 1),
      totalTrades: existingHolding.totalTrades + 1,
      realizedPnl: existingHolding.realizedPnl + pnl,
      lastTradeAt: timestamp,
    });
  }
});

PerpEngine.PositionLiquidated.handler(async ({ event, context }) => {
  context.log.info("PositionLiquidated handler called");
});
