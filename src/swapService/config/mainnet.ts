import { type ChainRoutingConfig, SwapperMode } from "../interface"
import {
  StrategyBalmySDK,
  StrategyCombinedUniswap,
  StrategyERC4626Wrapper,
  StrategyMidas,
  StrategyRepayWrapper,
} from "../strategies"

const SUSDS_MAINNET = "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd"
const WSTUSR_MAINNET = "0x1202f5c7b4b9e47a1a484e8b270be34dbbc75055"
const RLP_MAINNET = "0x4956b52aE2fF65D74CA2d61207523288e4528f96"
const WUSDL_MAINNET = "0x7751E2F4b8ae93EF6B79d86419d42FE3295A4559"
const PT_WSTUSR1740182579 = "0xd0097149aa4cc0d0e1fc99b8bd73fc17dc32c1e9"

const mainnetRoutingConfig: ChainRoutingConfig = [
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
  {
    strategy: StrategyERC4626Wrapper.name(),
    match: {
      tokensInOrOut: [WSTUSR_MAINNET, WUSDL_MAINNET, PT_WSTUSR1740182579],
    },
  },
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["pendle", "li-fi", "open-ocean"],
      },
    },
    match: { isPendlePT: true },
  },

  // RLP - only include odos for RLP, otherwise rate limits are hit
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: [
          "kyberswap",
          "paraswap",
          "odos",
          "1inch",
          "li-fi",
          "open-ocean",
          "uniswap",
        ],
      },
    },
    match: {
      tokensInOrOut: [RLP_MAINNET],
    },
  },

  // DEFAULTS
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: [
          "kyberswap",
          "paraswap",
          // "odos",
          "1inch",
          "li-fi",
          "open-ocean",
          "uniswap",
        ],
      },
    },
    match: {
      swapperModes: [SwapperMode.EXACT_IN],
    },
  },
  {
    strategy: StrategyCombinedUniswap.name(),
    match: {
      swapperModes: [SwapperMode.TARGET_DEBT],
      excludeTokensInOrOut: [RLP_MAINNET, SUSDS_MAINNET],
    },
  },
  // FALLBACKS

  // Binary search overswap for target debt
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: [
          "kyberswap",
          "paraswap",
          // "odos",
          "1inch",
          "li-fi",
          "open-ocean",
          "uniswap",
        ],
      },
    },
    match: {
      swapperModes: [SwapperMode.TARGET_DEBT],
    },
  },
]

export default mainnetRoutingConfig
