import { Strategy1Inch } from "./strategy1Inch"
import { StrategyBalmySDK } from "./strategyBalmySDK"
import { StrategyCombinedUniswap } from "./strategyCombinedUniswap"
import { StrategyLifi } from "./strategyLifi"
import { StrategyMTBILL } from "./strategyMTBILL"
import { StrategyPendle } from "./strategyPendle"
import { StrategyRepayWrapper } from "./strategyRepayWrapper"

export {
  Strategy1Inch,
  StrategyCombinedUniswap,
  StrategyMTBILL,
  StrategyPendle,
  StrategyLifi,
  StrategyRepayWrapper,
  StrategyBalmySDK,
}

export const strategies = {
  [Strategy1Inch.name()]: Strategy1Inch,
  [StrategyPendle.name()]: StrategyPendle,
  [StrategyMTBILL.name()]: StrategyMTBILL,
  [StrategyCombinedUniswap.name()]: StrategyCombinedUniswap,
  [StrategyRepayWrapper.name()]: StrategyRepayWrapper,
  [StrategyBalmySDK.name()]: StrategyBalmySDK,
  [StrategyLifi.name()]: StrategyLifi,
}
