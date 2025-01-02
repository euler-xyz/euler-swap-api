import { getSupportedChains } from "@/swapService/config"
import type {
  ChainId,
  IFetchService,
  TimeString,
  Timestamp,
  TokenAddress,
} from "@balmy/sdk"
import type {
  IPriceSource,
  PriceInput,
  PriceResult,
  PricesQueriesSupport,
  TokenPrice,
} from "@balmy/sdk/dist/services/prices/types"
import { Addresses } from "@balmy/sdk/dist/shared/constants"
import { reduceTimeout, timeoutPromise } from "@balmy/sdk/dist/shared/timeouts"
import {
  filterRejectedResults,
  groupByChain,
  isSameAddress,
} from "@balmy/sdk/dist/shared/utils"
import { type Address, Hex, isAddressEqual } from "viem"

export class EulerPriceApiPriceSource implements IPriceSource {
  constructor(private readonly fetch: IFetchService) {}

  supportedQueries() {
    const support: PricesQueriesSupport = {
      getCurrentPrices: true,
      getHistoricalPrices: false,
      getBulkHistoricalPrices: false,
      getChart: false,
    }
    const entries = getSupportedChains().map((chainId) => [chainId, support])
    return Object.fromEntries(entries)
  }

  async getCurrentPrices({
    tokens,
    config,
  }: {
    tokens: PriceInput[]
    config: { timeout?: TimeString } | undefined
  }): Promise<Record<ChainId, Record<TokenAddress, PriceResult>>> {
    const groupedByChain = groupByChain(tokens, ({ token }) => token)
    const reducedTimeout = reduceTimeout(config?.timeout, "100")
    const promises = Object.entries(groupedByChain).map(
      async ([chainId, tokens]) => [
        Number(chainId),
        await timeoutPromise(
          this.getCurrentPricesInChain(Number(chainId), tokens, reducedTimeout),
          reducedTimeout,
        ),
      ],
    )

    return Object.fromEntries(await filterRejectedResults(promises))
  }

  getHistoricalPrices(_: {
    tokens: PriceInput[]
    timestamp: Timestamp
    searchWidth: TimeString | undefined
    config: { timeout?: TimeString } | undefined
  }): Promise<Record<ChainId, Record<TokenAddress, PriceResult>>> {
    // TODO: Add support
    return Promise.reject(new Error("Operation not supported"))
  }

  getBulkHistoricalPrices(_: {
    tokens: { chainId: ChainId; token: TokenAddress; timestamp: Timestamp }[]
    searchWidth: TimeString | undefined
    config: { timeout?: TimeString } | undefined
  }): Promise<
    Record<ChainId, Record<TokenAddress, Record<Timestamp, PriceResult>>>
  > {
    return Promise.reject(new Error("Operation not supported"))
  }

  async getChart(_: {
    tokens: PriceInput[]
    span: number
    period: TimeString
    bound: { from: Timestamp } | { upTo: Timestamp | "now" }
    searchWidth?: TimeString
    config: { timeout?: TimeString } | undefined
  }): Promise<Record<ChainId, Record<TokenAddress, PriceResult[]>>> {
    return Promise.reject(new Error("Operation not supported"))
  }

  private async getCurrentPricesInChain(
    chainId: ChainId,
    addresses: TokenAddress[],
    timeout?: TimeString,
  ) {
    const addressesWithoutNativeToken = addresses.filter(
      (address) => !isSameAddress(address, Addresses.NATIVE_TOKEN),
    )
    const erc20LowerCased = await this.fetchERC20Prices(
      chainId,
      addressesWithoutNativeToken,
      timeout,
    )

    return Object.fromEntries(
      addresses.map((address) => [
        address,
        erc20LowerCased[address.toLowerCase()],
      ]),
    )
  }

  private async fetchERC20Prices(
    chainId: ChainId,
    addresses: TokenAddress[],
    timeout?: TimeString,
  ): Promise<Record<TokenAddress, PriceResult>> {
    if (addresses.length === 0) return {}
    const url = `https://app.euler.finance/api/v1/price?chainId=${chainId}`
    const response = await this.fetch.fetch(url, { timeout })
    const [body]: TokenPriceResponse[] = await response.json()

    const entries = Object.entries(body)
      .map(([token, { price, timestamp }]) => [
        token.toLowerCase(),
        { price, timestamp },
      ])
      .filter(([token]) =>
        addresses.some((a) => isAddressEqual(a as Address, token as Address)),
      )
    return Object.fromEntries(entries)
  }
}

type TokenPriceResponse = Record<
  TokenAddress,
  { price: TokenPrice; timestamp: Timestamp }
>
