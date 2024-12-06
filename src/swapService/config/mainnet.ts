import { type ChainRoutingConfig, SwapperMode } from "../interface"
import {
  Strategy1Inch,
  StrategyBalmySDK,
  StrategyCombinedUniswap,
  StrategyERC4626Wrapper,
  StrategyLifi,
  StrategyMTBILL,
  StrategyPendle,
  StrategyRepayWrapper,
} from "../strategies"
import { MTBILL_MAINNET } from "../strategies/strategyMTBILL"

const SUSDS_MAINNET = "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd"
const EBTC_MAINNET = "0x657e8c867d8b37dcc18fa4caead9c45eb088c642"
const SCRVUSD_MAINNET = "0x0655977feb2f289a4ab78af67bab0d17aab84367"
const USD3_MAINNET = "0x0d86883faf4ffd7aeb116390af37746f45b6f378"
const EUSD_MAINNET = "0xa0d69e286b938e21cbf7e51d71f6a4c8918f482f"
const WSTUSR_MAINNET = "0x1202f5c7b4b9e47a1a484e8b270be34dbbc75055"

const mainnetRoutingConfig: ChainRoutingConfig = [
  // WRAPPERS
  {
    strategy: StrategyERC4626Wrapper.name(),
    match: {},
  },
  {
    strategy: StrategyRepayWrapper.name(),
    match: {
      isRepay: true,
      swapperModes: [SwapperMode.EXACT_IN],
    },
  },
  // SPECIAL CASE TOKENS
  {
    strategy: StrategyPendle.name(),
    match: {}, // strategy supports() will match pendle PT tokens on input/output
  },
  {
    strategy: StrategyMTBILL.name(),
    match: {
      tokensInOrOut: [MTBILL_MAINNET],
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
      ],
    },
  },
  {
    strategy: StrategyLifi.name(),
    match: {
      tokensInOrOut: [SUSDS_MAINNET],
    },
  },
  {
    // sUSDS fallback
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["paraswap", "open-ocean"],
      },
      tryExactOut: true,
    },
    match: {
      tokensInOrOut: [SUSDS_MAINNET],
    },
  },
  // DEFAULTS
  {
    strategy: Strategy1Inch.name(),
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

  // first try lifi and their exact out
  {
    strategy: StrategyBalmySDK.name(),
    config: {
      sourcesFilter: {
        includeSources: ["li-fi"],
      },
      tryExactOut: true,
      onlyExactOut: true,
    },
    match: {},
  },

  // then anything available through balmy. Overswap exact out
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
