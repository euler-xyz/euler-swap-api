import type { Address } from "viem"
import tokenList1 from "../../tokenLists/tokenList_1"

export type TokenListItem = {
  addressInfo: Address
  chainId: number
  decimals: number
  logoURI: string
  name: string
  symbol: string
  meta?: {
    poolId?: string
    isPendlePT?: boolean
    pendleMarket?: string
  }
}

const cache: Record<number, TokenListItem[]> = {
  1: tokenList1 as TokenListItem[],
}

export default function getTokenList(chainId: number): TokenListItem[] {
  return cache[chainId]
}
