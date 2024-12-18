import { type ChainRoutingConfig, SwapperMode } from "../interface"
import {
  StrategyBalmySDK,
  StrategyCombinedUniswap,
  StrategyERC4626Wrapper,
  StrategyMidas,
  StrategyRepayWrapper,
} from "../strategies"

const SUSDS_MAINNET = "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd"
const EBTC_MAINNET = "0x657e8c867d8b37dcc18fa4caead9c45eb088c642"
const SCRVUSD_MAINNET = "0x0655977feb2f289a4ab78af67bab0d17aab84367"
const USD3_MAINNET = "0x0d86883faf4ffd7aeb116390af37746f45b6f378"
const EUSD_MAINNET = "0xa0d69e286b938e21cbf7e51d71f6a4c8918f482f"
const WSTUSR_MAINNET = "0x1202f5c7b4b9e47a1a484e8b270be34dbbc75055"
const FDUSD_MAINNET = "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409" //TEST
const WUSDM_MAINNET = "0x57f5e098cad7a3d1eed53991d4d66c45c9af7812" //TEST
const WUSDL_MAINNET = "0x7751E2F4b8ae93EF6B79d86419d42FE3295A4559" // TEST
const WM_MAINNET = "0x437cc33344a0B27A429f795ff6B469C72698B291" // TEST
const USD0PLUSPLUS_MAINNET = "0x35d8949372d46b7a3d5a56006ae77b215fc69bc0" //TEST
// TEST mBASIS

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
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["pendle", "li-fi", "open-ocean"],
      },
    },
    match: { isPendlePT: true },
  },
  {
    strategy: StrategyMidas.name(),
    match: {}, // supports function will match mTokens
  },
  {
    strategy: StrategyERC4626Wrapper.name(),
    match: {
      tokensInOrOut: [WSTUSR_MAINNET, WUSDL_MAINNET],
    },
  },
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
        ],
      },
    },
    match: {
      tokensInOrOut: [
        EBTC_MAINNET,
        USD3_MAINNET,
        EUSD_MAINNET,
        SCRVUSD_MAINNET,
        WSTUSR_MAINNET,
        FDUSD_MAINNET,
        WUSDM_MAINNET,
        WM_MAINNET,
        USD0PLUSPLUS_MAINNET,
      ],
    },
  },
  {
    // sUSDS
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["paraswap", "open-ocean", "li-fi", "odos", "1inch"],
      },
      tryExactOut: true,
    },
    match: {
      tokensInOrOut: [SUSDS_MAINNET],
    },
  },
  // DEFAULTS
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["1inch"],
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
    },
  },
  // FALLBACKS

  // fallback for target debt - 1inch binary search
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["1inch"],
      },
    },
    match: {
      swapperModes: [SwapperMode.TARGET_DEBT],
    },
  },

  // then anything available through balmy, binary search overswap exact out
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
          "conveyor",
          "uniswap",
        ],
      },
    },
    match: {},
  },
]

export default mainnetRoutingConfig
