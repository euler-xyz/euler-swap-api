import fs from "node:fs"
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
;(function buildCache() {
  const dir = `${__dirname}/../tokenLists`
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const match = file.match(/(\d+)/g)
    if (!match) throw new Error("Invalid tokenlist file")
    const chainId = Number(match[0])
    cache[chainId] = JSON.parse(
      fs.readFileSync(`${dir}/${file}`).toString(),
    ) as TokenListItem[]
  }
})()

export default function getTokenList(chainId: number): TokenListItem[] {
  return cache[chainId] || []
}

export function getAllTokenLists() {
  return cache
}
