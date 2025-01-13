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
const PT_WSTUSR_27MAR2025_MAINNET = "0xA8c8861b5ccF8CCe0ade6811CD2A7A7d3222B0B8"
const USD0PLUSPLUS_MAINNET = "0x35d8949372d46b7a3d5a56006ae77b215fc69bc0"

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
      excludeTokensInOrOut: [PT_WSTUSR_27MAR2025_MAINNET],
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
  // USD0++ route without open-ocean and combined
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
          // "open-ocean",
          "uniswap",
        ],
      },
    },
    match: {
      tokensInOrOut: [USD0PLUSPLUS_MAINNET],
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
          "odos",
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
      excludeTokensInOrOut: [RLP_MAINNET, SUSDS_MAINNET, USD0PLUSPLUS_MAINNET],
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
          "odos",
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
