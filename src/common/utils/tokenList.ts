import type { Address } from "viem"
import tokenList1 from "../../tokenLists/tokenList_1"
import tokenList1923 from "../../tokenLists/tokenList_1923"
import tokenList8453 from "../../tokenLists/tokenList_8543"

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
  8453: tokenList8453 as TokenListItem[],
  1923: tokenList1923 as TokenListItem[],
}

export default function getTokenList(chainId: number): TokenListItem[] {
  return cache[chainId]
}
