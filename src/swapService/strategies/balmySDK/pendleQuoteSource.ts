import { findToken } from "@/swapService/utils"
import { Chains } from "@balmy/sdk"
import type {
  BuildTxParams,
  IQuoteSource,
  QuoteParams,
  QuoteSourceMetadata,
  SourceQuoteResponse,
  SourceQuoteTransaction,
} from "@balmy/sdk/dist/services/quotes/quote-sources/types"
import {
  addQuoteSlippage,
  calculateAllowanceTarget,
  failed,
} from "@balmy/sdk/dist/services/quotes/quote-sources/utils"
import qs from "qs"
import { getAddress } from "viem"

// https://api-v2.pendle.finance/core/docs#/Chains/ChainsController_getSupportedChainIds
export const PENDLE_METADATA: QuoteSourceMetadata<PendleSupport> = {
  name: "Pendle",
  supports: {
    chains: [
      Chains.ETHEREUM.chainId,
      Chains.OPTIMISM.chainId,
      Chains.BNB_CHAIN.chainId,
      Chains.MANTLE.chainId,
      Chains.BASE.chainId,
      Chains.ARBITRUM.chainId,
    ],
    swapAndTransfer: true,
    buyOrders: false,
  },
  logoURI: "",
}
type PendleSupport = { buyOrders: false; swapAndTransfer: true }
type CustomOrAPIKeyConfig =
  | { customUrl: string; apiKey?: undefined }
  | { customUrl?: undefined; apiKey: string }
type PendleConfig = CustomOrAPIKeyConfig
type PendleData = { tx: SourceQuoteTransaction }
export class CustomPendleQuoteSource
  implements IQuoteSource<PendleSupport, PendleConfig, PendleData>
{
  getMetadata() {
    return PENDLE_METADATA
  }

  async quote(
    params: QuoteParams<PendleSupport, PendleConfig>,
  ): Promise<SourceQuoteResponse<PendleData>> {
    const { dstAmount, to, data } = await this.getQuote(params)
    console.log("pendle: ", dstAmount)

    const quote = {
      sellAmount: params.request.order.sellAmount,
      buyAmount: BigInt(dstAmount),
      allowanceTarget: calculateAllowanceTarget(params.request.sellToken, to),
      customData: {
        tx: {
          to,
          calldata: data,
        },
      },
    }

    return addQuoteSlippage(
      quote,
      params.request.order.type,
      params.request.config.slippagePercentage,
    )
  }

  async buildTx({
    request,
  }: BuildTxParams<PendleConfig, PendleData>): Promise<SourceQuoteTransaction> {
    return request.customData.tx
  }

  private async getQuote({
    components: { fetchService },
    request: {
      chainId,
      sellToken,
      buyToken,
      order,
      config: { slippagePercentage, timeout },
      accounts: { takeFrom, recipient },
    },
    config,
  }: QuoteParams<PendleSupport, PendleConfig>) {
    const queryParams = {
      receiver: recipient || takeFrom,
      slippage: slippagePercentage / 100, // 1 = 100%
      enableAggregator: true,
      tokenIn: sellToken,
      tokenOut: buyToken,
      amountIn: order.sellAmount.toString(),
    }

    const queryString = qs.stringify(queryParams, {
      skipNulls: true,
      arrayFormat: "comma",
    })
    const tokenIn = findToken(chainId, getAddress(sellToken))
    const tokenOut = findToken(chainId, getAddress(buyToken))

    const pendleMarket =
      tokenIn.meta?.pendleMarket || tokenOut.meta?.pendleMarket

    const url = `${getUrl()}/${chainId}/markets/${pendleMarket}/swap?${queryString}`
    const response = await fetchService.fetch(url, {
      timeout,
      headers: getHeaders(config),
    })

    if (!response.ok) {
      failed(
        PENDLE_METADATA,
        chainId,
        sellToken,
        buyToken,
        (await response.text()) || `Failed with status ${response.status}`,
      )
    }
    const {
      data: { amountOut: dstAmount },
      tx: { to, data },
    } = await response.json()

    return { dstAmount, to, data }
  }

  isConfigAndContextValidForQuoting(
    config: Partial<PendleConfig> | undefined,
  ): config is PendleConfig {
    return true
  }

  isConfigAndContextValidForTxBuilding(
    config: Partial<PendleConfig> | undefined,
  ): config is PendleConfig {
    return true
  }
}

function getUrl() {
  return "https://api-v2.pendle.finance/core/v1/sdk"
}

function getHeaders(config: PendleConfig) {
  const headers: Record<string, string> = {
    accept: "application/json",
  }
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`
  }
  return headers
}
