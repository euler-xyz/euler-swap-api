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
}

export interface SwapQuote {
  swapParams: SwapParams
  amountIn: bigint
  amountInMax?: bigint
  amountOut: bigint
  amountOutMin?: bigint
  data: Hex
  protocol: string
}

export interface StrategyResult {
  strategy: string
  match: boolean
  supports: boolean
  error?: unknown
  response?: SwapApiResponse
}
