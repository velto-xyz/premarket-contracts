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
  context.log.info("PositionOpened handler called");
});

PerpEngine.PositionClosed.handler(async ({ event, context }) => {
  context.log.info("PositionClosed handler called");
});

PerpEngine.PositionLiquidated.handler(async ({ event, context }) => {
  context.log.info("PositionLiquidated handler called");
});
