import { type ChainRoutingConfig, SwapperMode } from "../interface"
import { StrategyBalmySDK, StrategyRepayWrapper } from "../strategies"

const CBBTC_BASE = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"

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

  // avoid 1inch because of InvalidatedOrder error. Kyberswap and li.fi also route through 1inch
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["odos", "open-ocean", "uniswap"],
      },
    },
    match: {
      tokensInOrOut: [CBBTC_BASE],
    },
  },
  // avoid USDC on kyberswap
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["odos", "1inch", "open-ocean", "uniswap"],
      },
    },
    match: {
      tokensInOrOut: [USDC_BASE],
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
          "odos",
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
