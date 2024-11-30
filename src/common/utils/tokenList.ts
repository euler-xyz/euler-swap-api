import type { Address } from "viem"

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

const cache: Record<number, TokenListItem[]> = {}

export default function getTokenList(chainId: number): TokenListItem[] {
  if (!cache[chainId]) {
    cache[chainId] = require(`./tokenList_${chainId}.json`)
  }

  return cache[chainId]
}
