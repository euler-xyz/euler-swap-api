import { StrategyBalmySDK } from "./strategyBalmySDK"
import { StrategyCombinedUniswap } from "./strategyCombinedUniswap"
import { StrategyERC4626Wrapper } from "./strategyERC4626Wrapper"
import { StrategyIdleCDOTranche } from "./strategyIdleCDOTranche"
import { StrategyMidas } from "./strategyMidas"
import { StrategyRepayWrapper } from "./strategyRepayWrapper"

export {
  StrategyCombinedUniswap,
  StrategyMidas,
  StrategyRepayWrapper,
  StrategyBalmySDK,
  StrategyERC4626Wrapper,
  StrategyIdleCDOTranche,
}

export const strategies = {
  [StrategyMidas.name()]: StrategyMidas,
  [StrategyCombinedUniswap.name()]: StrategyCombinedUniswap,
  [StrategyRepayWrapper.name()]: StrategyRepayWrapper,
  [StrategyBalmySDK.name()]: StrategyBalmySDK,
  [StrategyERC4626Wrapper.name()]: StrategyERC4626Wrapper,
  [StrategyIdleCDOTranche.name()]: StrategyIdleCDOTranche,
}
