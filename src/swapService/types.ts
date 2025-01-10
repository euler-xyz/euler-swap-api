import type { TokenListItem } from "@/common/utils/tokenList"
import type { Address, Hex } from "viem"
import type {
  ChainRoutingConfig,
  SwapApiResponse,
  SwapperMode,
} from "./interface"

export interface SwapParams {
  chainId: number
  tokenIn: TokenListItem
  tokenOut: TokenListItem
  accountIn: Address
  accountOut: Address
  vaultIn: Address
  receiver: Address
  origin: Address
  swapperMode: SwapperMode
  from: Address
  amount: bigint
  targetDebt: bigint
  currentDebt: bigint
  slippage: number
  deadline: number
  isRepay: boolean
  routingOverride?: ChainRoutingConfig
  onlyFixedInputExactOut?: boolean // only fetch quotes where amountIn is fixed and not subject to slippage
}

export interface SwapQuote {
  swapParams: SwapParams
  amountIn: bigint
  amountInMax?: bigint
  amountOut: bigint
  amountOutMin?: bigint
  data: Hex
  protocol: string
  shouldTransferToReceiver?: boolean
  allowanceTarget?: Address
}

export interface StrategyResult {
  strategy: string
  match: boolean
  supports: boolean
  error?: unknown
  response?: SwapApiResponse
}
