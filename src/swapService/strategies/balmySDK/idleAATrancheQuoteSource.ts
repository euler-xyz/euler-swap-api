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
} from "@balmy/sdk/dist/services/quotes/quote-sources/utils"
import {
  type Address,
  type PublicClient,
  encodeFunctionData,
  isAddressEqual,
} from "viem"

const assets: {
  cdo: Address
  aaTranche: Address
  aaTrancheVault: Address
  token: Address
  tokenDecimals: bigint
  swapHandler: Address
  priceOne: bigint
}[] = [
  {
    // IdleCDO AA Tranche - idle_Fasanara
    cdo: "0xf6223C567F21E33e859ED7A045773526E9E3c2D5",
    aaTranche: "0x45054c6753b4Bce40C5d54418DabC20b070F85bE",
    aaTrancheVault: "0xd820C8129a853a04dC7e42C64aE62509f531eE5A",
    token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    swapHandler: "0xA24689b6Ab48eCcF7038c70eBC39f9ed4217aFE3",
    tokenDecimals: 6n,
    priceOne: 1000000n,
  },
]

// Supported networks: https://docs.1inch.io/docs/aggregation-protocol/introduction/#supported-networkschains
export const IDLEAATRANCHE_METADATA: QuoteSourceMetadata<IdleAATrancheSupport> =
  {
    name: "IdleCDO",
    supports: {
      chains: [Chains.ETHEREUM.chainId],
      swapAndTransfer: true,
      buyOrders: false,
    },
    logoURI: "",
  }

type IdleAATrancheSupport = { buyOrders: false; swapAndTransfer: true }
type IdleAATrancheConfig = object
type IdleAATrancheData = { tx: SourceQuoteTransaction }
export class CustomIdleAATrancheQuoteSource
  implements
    IQuoteSource<IdleAATrancheSupport, IdleAATrancheConfig, IdleAATrancheData>
{
  getMetadata() {
    return IDLEAATRANCHE_METADATA
  }

  async quote(
    params: QuoteParams<IdleAATrancheSupport, IdleAATrancheConfig>,
  ): Promise<SourceQuoteResponse<IdleAATrancheData>> {
    const asset = assets.find(
      (a) =>
        a.aaTranche === params.request.sellToken ||
        a.aaTranche === params.request.buyToken,
    )
    if (!asset) throw new Error("Asset not found")

    const viemClient = params.components.providerService.getViemPublicClient({
      chainId: params.request.chainId,
    }) as PublicClient
    const virtualPrice = await fetchVirtualPrice(
      viemClient,
      asset.cdo,
      asset.aaTranche,
    )

    const to = asset.swapHandler
    let amountOut
    let data
    if (isAddressEqual(params.request.buyToken as Address, asset.aaTranche)) {
      amountOut =
        (params.request.order.sellAmount *
          asset.priceOne *
          10n ** (18n - asset.tokenDecimals)) /
        virtualPrice
      data = encodeSwapExactTokensForAATranche(params.request.order.sellAmount)
    } else {
      amountOut =
        (params.request.order.sellAmount *
          virtualPrice *
          10n ** (18n - asset.tokenDecimals)) /
        asset.priceOne
      data = encodeSwapExactAATrancheForTokens(params.request.order.sellAmount)
    }

    const quote = {
      sellAmount: params.request.order.sellAmount,
      buyAmount: BigInt(amountOut),
      estimatedGas: undefined,
      allowanceTarget: calculateAllowanceTarget(params.request.sellToken, to),
      customData: {
        tx: {
          to,
          calldata: data,
          value: 0n,
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
  }: BuildTxParams<
    IdleAATrancheConfig,
    IdleAATrancheData
  >): Promise<SourceQuoteTransaction> {
    return request.customData.tx
  }

  isConfigAndContextValidForQuoting(
    config: Partial<IdleAATrancheConfig> | undefined,
  ): config is IdleAATrancheConfig {
    return true
  }

  isConfigAndContextValidForTxBuilding(
    config: Partial<IdleAATrancheConfig> | undefined,
  ): config is IdleAATrancheConfig {
    return true
  }
}

function encodeSwapExactTokensForAATranche(amount: bigint) {
  const abiItem = {
    inputs: [{ name: "amountIn", type: "uint256" }],
    name: "swapExactTokensForAATranche",
    stateMutability: "nonpayable",
    type: "function",
  }

  const functionData = encodeFunctionData({
    abi: [abiItem],
    args: [amount],
  })

  return functionData
}

function encodeSwapExactAATrancheForTokens(amount: bigint) {
  const abiItem = {
    inputs: [{ name: "amountIn", type: "uint256" }],
    name: "swapExactAATrancheForTokens",
    stateMutability: "nonpayable",
    type: "function",
  }

  const functionData = encodeFunctionData({
    abi: [abiItem],
    args: [amount],
  })

  return functionData
}

export async function fetchVirtualPrice(
  client: PublicClient,
  cdo: Address,
  tranche: Address,
) {
  const abiItem = {
    name: "virtualPrice",
    inputs: [{ name: "_tranche", type: "address" }],
    outputs: [{ name: "_virtualPrice", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  }

  const query = {
    address: cdo,
    abi: [abiItem],
    functionName: "virtualPrice",
    args: [tranche],
  } as const

  const data = (await client.readContract(query)) as bigint

  return data
}
