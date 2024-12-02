import {
  type BuildParams,
  type QuoteRequest,
  type QuoteResponse,
  type QuoteResponseWithTx,
  buildSDK,
} from "@balmy/sdk"
import { buildFetchService } from "@balmy/sdk/dist/sdk/builders/fetch-builder"
import { buildProviderService } from "@balmy/sdk/dist/sdk/builders/provider-builder"
import { type Hex, encodeAbiParameters, parseAbiParameters } from "viem"
import { SwapperMode } from "../interface"
import type { StrategyResult, SwapParams, SwapQuote } from "../types"
import {
  SWAPPER_HANDLER_GENERIC,
  adjustForInterest,
  binarySearchQuote,
  buildApiResponseExactInputFromQuote,
  buildApiResponseSwap,
  buildApiResponseVerifyDebtMax,
  encodeSwapMulticallItem,
  isExactInRepay,
  matchParams,
  quoteToRoute,
} from "../utils"
import { CustomSourceList } from "./balmySDK/customSourceList"

const DAO_MULTISIG = "0xcAD001c30E96765aC90307669d578219D4fb1DCe"

export const defaultConfig = {
  referrer: {
    address: DAO_MULTISIG,
    name: "euler",
  },
  sourcesFilter: { excludeSources: ["balmy"] },
  tryExactOut: false, // tries buy order search through balmy before falling back to binary search.
  // Use only if exact out behavior is known for source
  onlyExactOut: false, // don't try overswapping when exact out not available
}
export class StrategyBalmySDK {
  static name() {
    return "balmy_sdk"
  }
  readonly match
  readonly config

  private readonly sdk

  constructor(match = {}, config = defaultConfig) {
    const fetchService = buildFetchService()
    const providerService = buildProviderService()

    const buildParams: BuildParams = {
      quotes: {
        sourceList: {
          type: "custom",
          instance: new CustomSourceList({ providerService, fetchService }),
        },
        defaultConfig: {
          global: {
            disableValidation: true,
            referrer: config.referrer,
          },
          custom: {
            "1inch": {
              apiKey: String(process.env.ONEINCH_API_KEY),
            },
            "li-fi": {
              apiKey: String(process.env.LIFI_API_KEY),
            },
          },
        },
      },
    }
    this.sdk = buildSDK(buildParams)
    this.match = match
    this.config = config
  }

  async supports(swapParams: SwapParams) {
    return (
      !isExactInRepay(swapParams) &&
      this.sdk.quoteService.supportedChains().includes(swapParams.chainId)
    )
  }

  async findSwap(swapParams: SwapParams): Promise<StrategyResult> {
    const result: StrategyResult = {
      strategy: StrategyBalmySDK.name(),
      supports: await this.supports(swapParams),
      match: matchParams(swapParams, this.match),
    }

    if (!result.supports || !result.match) return result

    try {
      switch (swapParams.swapperMode) {
        case SwapperMode.EXACT_IN: {
          result.response = await this.exactIn(swapParams)
          break
        }
        case SwapperMode.TARGET_DEBT: {
          result.response = await this.targetDebt(swapParams)
          break
        }
        // case SwapperMode.EXACT_OUT:
        default: {
          result.error = "Unsupported swap mode"
        }
      }
    } catch (error) {
      result.error = error
    }

    return result
  }

  async exactIn(swapParams: SwapParams) {
    const bestQuoteWithTx = await this.#getBestSDKQuoteWithTx(swapParams)
    const swapQuote = this.#getSwapQuoteFromSDKQuoteWithTx(
      swapParams,
      bestQuoteWithTx,
    )
    return buildApiResponseExactInputFromQuote(swapParams, swapQuote)
  }

  async targetDebt(swapParams: SwapParams) {
    let quote: SwapQuote | undefined = undefined
    let innerSwapParams: SwapParams
    if (this.config.tryExactOut) {
      try {
        // into the swapper
        innerSwapParams = {
          ...swapParams,
          receiver: swapParams.from,
        }
        const quoteSDK = await this.#getBestSDKQuoteWithTx(innerSwapParams)
        quote = this.#getSwapQuoteFromSDKQuoteWithTx(innerSwapParams, quoteSDK)
      } catch {}
    }

    if (!quote && !this.config.onlyExactOut) {
      innerSwapParams = {
        ...swapParams,
        receiver: swapParams.from,
        swapperMode: SwapperMode.EXACT_IN,
      }

      quote = await this.#binarySearchOverswapQuote(innerSwapParams)
    }

    if (!quote) throw new Error("Quote not found")

    const multicallItems = [
      encodeSwapMulticallItem({
        handler: SWAPPER_HANDLER_GENERIC,
        mode: BigInt(SwapperMode.TARGET_DEBT),
        account: swapParams.accountOut,
        tokenIn: swapParams.tokenIn.addressInfo,
        tokenOut: swapParams.tokenOut.addressInfo,
        vaultIn: swapParams.vaultIn,
        accountIn: swapParams.accountIn,
        receiver: swapParams.receiver,
        amountOut: swapParams.targetDebt,
        data: quote.data,
      }),
    ]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifyDebtMax(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      swapParams.targetDebt,
      swapParams.deadline,
    )

    return {
      amountIn: String(quote.amountIn),
      amountInMax: String(quote.amountInMax),
      amountOut: String(quote.amountOut),
      amountOutMin: String(quote.amountOutMin),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: quoteToRoute(quote),
      swap,
      verify,
    }
  }

  async #binarySearchOverswapQuote(swapParams: SwapParams) {
    const fetchQuote = async (sp: SwapParams, sourcesFilter?: any) => {
      const quote = await this.#getBestSDKQuote(sp, sourcesFilter)
      return {
        quote,
        amountTo: quote.buyAmount.amount,
      }
    }

    const reverseSwapParams = {
      ...swapParams,
      tokenIn: swapParams.tokenOut,
      tokenOut: swapParams.tokenIn,
      swapperMode: SwapperMode.EXACT_IN,
    }

    const reverseQuote = await fetchQuote(reverseSwapParams)
    const estimatedAmountIn = reverseQuote.amountTo
    if (estimatedAmountIn === 0n) throw new Error("quote not found")

    const bestSourceId = reverseQuote.quote.source.id

    const overSwapTarget = adjustForInterest(swapParams.amount)

    const shouldContinue = (currentAmountTo: bigint): boolean =>
      // search until quote is 100 - 100.5% target
      currentAmountTo < overSwapTarget ||
      (currentAmountTo * 1000n) / overSwapTarget > 1005n

    const quote = await binarySearchQuote(
      swapParams,
      (swapParams: SwapParams) =>
        fetchQuote(swapParams, { includeSources: [bestSourceId] }), // preselect single source to avoid oscilations
      overSwapTarget,
      estimatedAmountIn,
      shouldContinue,
    )
    const quoteWithTx = {
      ...quote,
      tx: await this.#getTxForQuote(quote),
    }

    return this.#getSwapQuoteFromSDKQuoteWithTx(swapParams, quoteWithTx)
  }

  async #getBestSDKQuote(swapParams: SwapParams, sourcesFilter?: any) {
    // TODO type
    const bestQuote = await this.sdk.quoteService.getBestQuote({
      request: this.#getSDKQuoteFromSwapParams(swapParams, sourcesFilter),
      config: {
        choose: {
          by: "most-swapped-accounting-for-gas",
        },
      },
    })

    return bestQuote
  }

  async #getBestSDKQuoteWithTx(swapParams: SwapParams, sourcesFilter?: any) {
    const bestQuote = await this.#getBestSDKQuote(swapParams, sourcesFilter)

    const bestQuoteWithTx = {
      ...bestQuote,
      tx: await this.#getTxForQuote(bestQuote),
    }

    return bestQuoteWithTx
  }

  async #getTxForQuote(quote: QuoteResponse) {
    return this.sdk.quoteService.buildTxs({
      quotes: { [quote.source.id]: quote },
    })[quote.source.id]
  }

  #getSDKQuoteFromSwapParams(
    swapParams: SwapParams,
    sourcesFilter?: any,
  ): QuoteRequest {
    return {
      chainId: swapParams.chainId,
      sellToken: swapParams.tokenIn.addressInfo,
      buyToken: swapParams.tokenOut.addressInfo,
      order: {
        ...(swapParams.swapperMode === SwapperMode.EXACT_IN
          ? { type: "sell", sellAmount: swapParams.amount }
          : { type: "buy", buyAmount: swapParams.amount }),
      },
      slippagePercentage: swapParams.slippage,
      takerAddress: swapParams.from,
      recipient: swapParams.receiver,
      filters: sourcesFilter || this.config.sourcesFilter,
    }
  }

  #getSwapQuoteFromSDKQuoteWithTx(
    swapParams: SwapParams,
    sdkQuote: QuoteResponseWithTx,
  ): SwapQuote {
    const data = encodeAbiParameters(parseAbiParameters("address, bytes"), [
      sdkQuote.tx.to as Hex,
      sdkQuote.tx.data as Hex,
    ])

    return {
      swapParams,
      amountIn: sdkQuote.sellAmount.amount,
      amountInMax: sdkQuote.maxSellAmount.amount,
      amountOut: sdkQuote.buyAmount.amount,
      amountOutMin: sdkQuote.minBuyAmount.amount,
      data,
      protocol: sdkQuote.source.name,
    }
  }
}
