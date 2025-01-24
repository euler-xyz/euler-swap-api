import { type ChainRoutingConfig, SwapperMode } from "../interface"
import {
  StrategyBalmySDK,
  StrategyMidas,
  StrategyRepayWrapper,
} from "../strategies"

const CBBTC_BASE = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"

const baseRoutingConfig: ChainRoutingConfig = [
  // WRAPPERS
  {
    strategy: StrategyRepayWrapper.name(),
    match: {
      isRepay: true,
      swapperModes: [SwapperMode.EXACT_IN],
    },
  },
  // SPECIAL CASE TOKENS
  {
    strategy: StrategyMidas.name(),
    match: {}, // supports function will match mTokens
  },
  // avoid 1inch because of InvalidatedOrder error. Kyberswap and li.fi also route through 1inch
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: [
          // "odos",
          "open-ocean",
          "uniswap",
        ],
      },
    },
    match: {
      tokensInOrOut: [CBBTC_BASE],
    },
  },
  // DEFAULTS
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: [
          "kyberswap",
          // "paraswap",
          // "odos",
          "1inch",
          "li-fi",
          "open-ocean",
          // "conveyor",
          "uniswap",
        ],
      },
    },
    match: {},
  },
]

export default baseRoutingConfig
