import { Strategy1Inch } from "./strategy1Inch"
import { StrategyBalmySDK } from "./strategyBalmySDK"
import { StrategyCombinedUniswap } from "./strategyCombinedUniswap"
import { StrategyERC4626Wrapper } from "./strategyERC4626Wrapper"
import { StrategyLifi } from "./strategyLifi"
import { StrategyMidas } from "./strategyMidas"
import { StrategyPendle } from "./strategyPendle"
import { StrategyRepayWrapper } from "./strategyRepayWrapper"

export {
  Strategy1Inch,
  StrategyCombinedUniswap,
  StrategyMidas,
  StrategyPendle,
  StrategyLifi,
  StrategyRepayWrapper,
  StrategyBalmySDK,
  StrategyERC4626Wrapper,
}

export const strategies = {
  [Strategy1Inch.name()]: Strategy1Inch,
  [StrategyPendle.name()]: StrategyPendle,
  [StrategyMidas.name()]: StrategyMidas,
  [StrategyCombinedUniswap.name()]: StrategyCombinedUniswap,
  [StrategyRepayWrapper.name()]: StrategyRepayWrapper,
  [StrategyBalmySDK.name()]: StrategyBalmySDK,
  [StrategyLifi.name()]: StrategyLifi,
  [StrategyERC4626Wrapper.name()]: StrategyERC4626Wrapper,
}
