import { PerpFactory, PerpEngine } from "generated";

PerpFactory.MarketCreated.contractRegister(({ event, context }) => {
  context.log.info("MarketCreated contractRegister called");
  context.addPerpEngine(event.params.engine);
});

PerpFactory.MarketCreated.handler(async ({ event, context }) => {
  context.log.info("MarketCreated handler called");
  context.Market.set({
    id: event.params.marketIndex.toString(),
    engine: event.params.engine.toLowerCase(),
    market: event.params.market.toLowerCase(),
    collateralToken: event.params.collateralToken.toLowerCase(),
    createdAt: new Date(event.block.timestamp * 1000),
  });
});

PerpEngine.PositionOpened.handler(async ({ event, context }) => {
  const price = event.params.entryPrice;
  const baseSize = event.params.baseSize;
  const margin = event.params.margin;
  const notional = (price * baseSize) / BigInt(1e18);

  const id = `${event.block.hash}-${event.logIndex}`;
  const engine = event.srcAddress.toLowerCase();
  const userAddress = event.params.user.toLowerCase();
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
  });
});

PerpEngine.PositionClosed.handler(async ({ event, context }) => {
  const price = event.params.avgClosePrice;
  const pnl = event.params.totalPnl;

  const id = `${event.block.hash}-${event.logIndex}`;
  const engine = event.srcAddress.toLowerCase();
  const userAddress = event.params.user.toLowerCase();
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
  });
});

PerpEngine.PositionLiquidated.handler(async ({ event, context }) => {
  const id = `${event.block.hash}-${event.logIndex}`;
  const engine = event.srcAddress.toLowerCase();
  const userAddress = event.params.user.toLowerCase();
  const timestamp = new Date(event.block.timestamp * 1000);

  context.Trade.set({
    id,
    engine,
    user: userAddress,
    positionId: event.params.positionId,
    eventType: "liquidate",
    price: BigInt(0),
    baseSize: BigInt(0),
    margin: BigInt(0),
    notional: BigInt(0),
    pnl: undefined,
    isLong: false,
    timestamp,
  });
});
