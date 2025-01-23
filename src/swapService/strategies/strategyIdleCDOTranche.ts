import { viemClients } from "@/common/utils/viemClients"
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  isAddressEqual,
  parseAbiParameters,
  publicActions,
} from "viem"
import { type SwapApiResponse, SwapperMode } from "../interface"
import { runPipeline } from "../runner"
import type { StrategyResult, SwapParams } from "../types"
import {
  SWAPPER_HANDLER_GENERIC,
  adjustForInterest,
  applySlippage,
  buildApiResponseSwap,
  buildApiResponseVerifyDebtMax,
  buildApiResponseVerifySkimMin,
  encodeDepositMulticallItem,
  encodeSwapMulticallItem,
  findToken,
  isExactInRepay,
  matchParams,
} from "../utils"

const defaultConfig: {
  supportedTranches: Array<{
    chainId: number
    swapHandler: Address
    cdo: Address
    aaTranche: Address
    aaTrancheVault: Address
    underlying: Address
    underlyingDustVault: Address
    underlyingDecimals: bigint
    priceOne: bigint
  }>
} = {
  supportedTranches: [
    {
      // IdleCDO AA Tranche - idle_Fasanara
      chainId: 1,
      swapHandler: "0xA24689b6Ab48eCcF7038c70eBC39f9ed4217aFE3",
      cdo: "0xf6223C567F21E33e859ED7A045773526E9E3c2D5",
      aaTranche: "0x45054c6753b4Bce40C5d54418DabC20b070F85bE",
      aaTrancheVault: "0xd820C8129a853a04dC7e42C64aE62509f531eE5A",
      underlying: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      underlyingDustVault: "0xb93d4928f39fbcd6c89a7dfbf0a867e6344561be", // eUSDC-1 escrow
      underlyingDecimals: 6n,
      priceOne: 1000000n,
    },
  ],
}

const PROTOCOL = { providerName: "IdleCDO" }

// Wrapper which adds an ERC4626 deposit or withdraw in front or at the back of a trade
export class StrategyERC4626Wrapper {
  static name() {
    return "erc4626_wrapper"
  }
  readonly match
  readonly config

  constructor(match = {}, config = defaultConfig) {
    this.match = match
    this.config = config
  }

  async supports(swapParams: SwapParams) {
    return (
      !isExactInRepay(swapParams) &&
      this.config.supportedTranches.some(
        (v) =>
          v.chainId === swapParams.chainId &&
          (isAddressEqual(v.aaTranche, swapParams.tokenIn.addressInfo) ||
            isAddressEqual(v.aaTranche, swapParams.tokenOut.addressInfo)),
      )
    )
  }

  async findSwap(swapParams: SwapParams): Promise<StrategyResult> {
    const result: StrategyResult = {
      strategy: StrategyERC4626Wrapper.name(),
      supports: await this.supports(swapParams),
      match: matchParams(swapParams, this.match),
    }

    if (!result.supports || !result.match) return result

    try {
      switch (swapParams.swapperMode) {
        case SwapperMode.EXACT_IN: {
          if (this.isSupportedTranche(swapParams.tokenIn.addressInfo)) {
            if (
              this.isSupportedTrancheUnderlying({
                aaTranche: swapParams.tokenIn.addressInfo,
                underlying: swapParams.tokenOut.addressInfo,
              })
            ) {
              result.response =
                await this.exactInFromAssetToUnderlying(swapParams)
            } else {
              result.response = await this.exactInFromAssetToAny(swapParams)
            }
          } else {
            if (
              this.isSupportedTrancheUnderlying({
                aaTranche: swapParams.tokenOut.addressInfo,
                underlying: swapParams.tokenIn.addressInfo,
              })
            ) {
              result.response =
                await this.exactInFromUnderlyingToAsset(swapParams)
            } else {
              result.response = await this.exactInFromAnyToAsset(swapParams)
            }
          }
          break
        }
        case SwapperMode.TARGET_DEBT: {
          if (this.isSupportedTranche(swapParams.tokenIn.addressInfo)) {
            if (
              this.isSupportedTrancheUnderlying({
                aaTranche: swapParams.tokenIn.addressInfo,
                underlying: swapParams.tokenOut.addressInfo,
              })
            ) {
              result.response =
                await this.targetDebtFromVaultToUnderlying(swapParams)
            } else {
              result.response = await this.targetDebtFromVaultToAny(swapParams) //test
            }
          } else {
            if (
              this.isSupportedTrancheUnderlying({
                aaTranche: swapParams.tokenOut.addressInfo,
                underlying: swapParams.tokenIn.addressInfo,
              })
            ) {
              result.response =
                await this.targetDebtFromUnderlyingToVault(swapParams)
            } else {
              result.response = await this.targetDebtFromAnyToVault(swapParams)
            }
          }
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

  async exactInFromAssetToUnderlying(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const {
      swapMulticallItem: redeemMulticallItem,
      amountOut: redeemAmountOut,
    } = await encodeRedeem(
      swapParams,
      swapParams.tokenIn.addressInfo,
      swapParams.amount,
      swapParams.receiver,
    )

    const multicallItems = [redeemMulticallItem]
    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifySkimMin(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      redeemAmountOut,
      swapParams.deadline,
    )

    return {
      amountIn: String(swapParams.amount),
      amountInMax: String(swapParams.amount),
      amountOut: String(redeemAmountOut),
      amountOutMin: String(redeemAmountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: 0,
      route: [PROTOCOL],
      swap,
      verify,
    }
  }

  async exactInFromAssetToAny(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const {
      swapMulticallItem: redeemMulticallItem,
      amountOut: redeemAmountOut,
    } = await encodeRedeem(
      swapParams,
      swapParams.tokenIn.addressInfo,
      swapParams.amount,
      swapParams.from,
    )

    const trancheData = this.getSupportedTranche(swapParams.tokenIn.addressInfo)
    const tokenIn = findToken(swapParams.chainId, trancheData.underlying)
    if (!tokenIn) throw new Error("Inner token not found")
    const innerSwapParams = {
      ...swapParams,
      tokenIn,
      amount: redeemAmountOut,
    }

    const innerSwap = await runPipeline(innerSwapParams)

    const intermediateDustDepositMulticallItem = encodeDepositMulticallItem(
      trancheData.underlying,
      trancheData.underlyingDustVault,
      5n, // avoid zero shares
      swapParams.accountOut,
    )

    const multicallItems = [
      redeemMulticallItem,
      ...innerSwap.swap.multicallItems,
      intermediateDustDepositMulticallItem,
    ]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)
    const verify = innerSwap.verify

    return {
      amountIn: String(swapParams.amount),
      amountInMax: String(swapParams.amount),
      amountOut: innerSwap.amountOut,
      amountOutMin: innerSwap.amountOutMin,
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [PROTOCOL, ...innerSwap.route],
      swap,
      verify,
    }
  }

  async exactInFromUnderlyingToAsset(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const trancheData = this.getSupportedTranche(
      swapParams.tokenOut.addressInfo,
    )

    const amountOut = await fetchPreviewDeposit(
      swapParams.chainId,
      trancheData.aaTranche,
      swapParams.amount,
    )
    const swapperDepositMulticallItem = encodeDepositMulticallItem(
      trancheData.underlying,
      trancheData.aaTranche,
      0n,
      swapParams.receiver,
    )

    const multicallItems = [swapperDepositMulticallItem]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const amountOutMin = applySlippage(amountOut, swapParams.slippage) // vault (tokenOut) can have growing exchange rate
    const verify = buildApiResponseVerifySkimMin(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      amountOutMin,
      swapParams.deadline,
    )

    return {
      amountIn: String(swapParams.amount),
      amountInMax: String(swapParams.amount),
      amountOut: String(amountOut),
      amountOutMin: String(amountOutMin),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [PROTOCOL],
      swap,
      verify,
    }
  }

  async exactInFromAnyToAsset(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const trancheData = this.getSupportedTranche(
      swapParams.tokenOut.addressInfo,
    )
    const tokenOut = findToken(swapParams.chainId, trancheData.underlying)
    if (!tokenOut) throw new Error("Inner token not found")
    const innerSwapParams = {
      ...swapParams,
      tokenOut,
      receiver: swapParams.from,
    }

    const innerSwap = await runPipeline(innerSwapParams)
    const amountOut = await fetchPreviewDeposit(
      swapParams.chainId,
      trancheData.aaTranche,
      BigInt(innerSwap.amountOut),
    )
    const amountOutMin = await fetchPreviewDeposit(
      swapParams.chainId,
      trancheData.aaTranche,
      BigInt(innerSwap.amountOutMin),
    )

    // Swapper.deposit will deposit all of available balance into the wrapper, and move the wrapper straight to receiver, where it can be skimmed
    const swapperDepositMulticallItem = encodeDepositMulticallItem(
      trancheData.underlying,
      trancheData.aaTranche,
      0n,
      swapParams.receiver,
    )

    const multicallItems = [
      ...innerSwap.swap.multicallItems,
      swapperDepositMulticallItem,
    ]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)
    const verify = buildApiResponseVerifySkimMin(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      amountOutMin,
      swapParams.deadline,
    )

    return {
      amountIn: String(swapParams.amount),
      amountInMax: String(swapParams.amount),
      amountOut: String(amountOut),
      amountOutMin: String(amountOutMin),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [PROTOCOL, ...innerSwap.route],
      swap,
      verify,
    }
  }

  async targetDebtFromVaultToUnderlying(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    // TODO expects dust - add to dust list
    const trancheData = this.getSupportedTranche(swapParams.tokenIn.addressInfo)
    const withdrawAmount = adjustForInterest(swapParams.amount)

    const {
      swapMulticallItem: withdrawMulticallItem,
      amountIn,
      amountOut,
    } = await encodeWithdraw(
      swapParams,
      trancheData.aaTranche,
      withdrawAmount,
      swapParams.from,
    )

    const multicallItems = [withdrawMulticallItem]
    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifyDebtMax(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      swapParams.targetDebt,
      swapParams.deadline,
    )

    return {
      amountIn: String(amountIn), // adjusted for accruing debt
      amountInMax: String(amountIn),
      amountOut: String(amountOut),
      amountOutMin: String(amountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: 0,
      route: [PROTOCOL],
      swap,
      verify,
    }
  }

  async targetDebtFromVaultToAny(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    // TODO expects dust out - add to dust list
    const trancheData = this.getSupportedTranche(swapParams.tokenIn.addressInfo)
    const tokenIn = findToken(swapParams.chainId, trancheData.underlying)
    if (!tokenIn) throw new Error("Inner token not found")
    const innerSwapParams = {
      ...swapParams,
      tokenIn,
      vaultIn: trancheData.underlyingDustVault,
      onlyFixedInputExactOut: true, // eliminate dust in the intermediate asset (vault underlying)
    }

    const innerQuote = await runPipeline(innerSwapParams)

    const withdrawSwapParams = {
      ...swapParams,
      swapperMode: SwapperMode.EXACT_IN, // change to exact in, otherwise multicall item will be target debt and will attempt a repay
    }
    const {
      swapMulticallItem: withdrawMulticallItem,
      amountIn: withdrawAmountIn,
    } = await encodeWithdraw(
      withdrawSwapParams,
      trancheData.aaTranche,
      BigInt(innerQuote.amountIn),
      swapParams.from,
    )

    // repay or exact out will return unused input, which is the intermediate asset
    const multicallItems = [
      withdrawMulticallItem,
      ...innerQuote.swap.multicallItems,
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
      amountIn: String(withdrawAmountIn),
      amountInMax: String(withdrawAmountIn),
      amountOut: String(innerQuote.amountOut),
      amountOutMin: String(innerQuote.amountOutMin),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [PROTOCOL, ...innerQuote.route],
      swap,
      verify,
    }
  }

  async targetDebtFromUnderlyingToVault(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const trancheData = this.getSupportedTranche(
      swapParams.tokenOut.addressInfo,
    )

    const mintAmount = adjustForInterest(swapParams.amount)

    const {
      swapMulticallItem: mintMulticallItem,
      amountIn,
      amountOut,
    } = await encodeMint(
      swapParams,
      trancheData.aaTranche,
      mintAmount,
      swapParams.from,
    )

    // mint is encoded in target debt mode, so repay will happen automatically
    const multicallItems = [mintMulticallItem]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifyDebtMax(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      swapParams.targetDebt,
      swapParams.deadline,
    )

    return {
      amountIn: String(amountIn),
      amountInMax: String(adjustForInterest(amountIn)), // compensate for intrinsic interest accrued in the vault (tokenIn)
      amountOut: String(amountOut),
      amountOutMin: String(amountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: 0,
      route: [PROTOCOL],
      swap,
      verify,
    }
  }

  async targetDebtFromAnyToVault(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const trancheData = this.getSupportedTranche(
      swapParams.tokenOut.addressInfo,
    )

    const mintAmount = adjustForInterest(swapParams.amount)
    const tokenIn = findToken(swapParams.chainId, trancheData.underlying)
    if (!tokenIn) throw new Error("Inner token in not found")
    const mintSwapParams = {
      ...swapParams,
      tokenIn,
      vaultIn: trancheData.underlyingDustVault,
    }

    const {
      swapMulticallItem: mintMulticallItem,
      amountIn: mintAmountIn,
      amountOut,
    } = await encodeMint(
      mintSwapParams,
      trancheData.aaTranche,
      mintAmount,
      swapParams.from,
    )

    const tokenOut = findToken(swapParams.chainId, trancheData.underlying)
    if (!tokenOut) throw new Error("Inner token not found")
    const innerSwapParams = {
      ...swapParams,
      amount: mintAmountIn,
      tokenOut,
      receiver: swapParams.from,
      onlyFixedInputExactOut: true, // this option will overswap, which should cover growing exchange rate
    }

    const innerQuote = await runPipeline(innerSwapParams)

    // re-encode inner swap from target debt to exact out so that repay is not executed before mint TODO fix with exact out support in all strategies
    const innerSwapItems = innerQuote.swap.multicallItems.map((item) => {
      if (item.functionName !== "swap") return item

      const newItem = encodeSwapMulticallItem({
        ...item.args[0],
        mode: BigInt(SwapperMode.EXACT_OUT),
      })

      return newItem
    })

    // repay is done through mint item, which will return unused input, which is the intermediate asset
    const multicallItems = [...innerSwapItems, mintMulticallItem]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifyDebtMax(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      swapParams.targetDebt,
      swapParams.deadline,
    )

    return {
      amountIn: String(innerQuote.amountIn),
      amountInMax: String(innerQuote.amountInMax),
      amountOut: String(amountOut),
      amountOutMin: String(amountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [...innerQuote.route, PROTOCOL],
      swap,
      verify,
    }
  }

  isSupportedTranche(asset: Address) {
    return this.config.supportedTranches.some((v) =>
      isAddressEqual(v.aaTranche, asset),
    )
  }

  isSupportedTrancheUnderlying({
    aaTranche,
    underlying,
  }: { aaTranche: Address; underlying: Address }) {
    const asset = this.config.supportedTranches.find((v) =>
      isAddressEqual(v.aaTranche, aaTranche),
    )?.underlying
    return !!asset && isAddressEqual(asset, underlying)
  }

  getSupportedTranche(aaTranche: Address) {
    const supportedTranche = this.config.supportedTranches.find((v) =>
      isAddressEqual(v.aaTranche, aaTranche),
    )
    if (!supportedTranche) throw new Error("Tranche not supported")

    return supportedTranche
  }
}

export async function encodeRedeem(
  swapParams: SwapParams,
  vault: Address,
  amountIn: bigint,
  receiver: Address,
) {
  const amountOut = await fetchPreviewRedeem(
    swapParams.chainId,
    vault,
    amountIn,
  )

  const abiItem = {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    name: "redeem",
    stateMutability: "nonpayable",
    type: "function",
  }

  const redeemData = encodeFunctionData({
    abi: [abiItem],
    args: [amountIn, receiver, swapParams.from],
  })

  const swapData = encodeAbiParameters(parseAbiParameters("address, bytes"), [
    vault,
    redeemData,
  ])

  const swapperAmountOut =
    swapParams.swapperMode === SwapperMode.EXACT_IN
      ? 0n //ignored
      : swapParams.swapperMode === SwapperMode.EXACT_OUT
        ? amountOut
        : swapParams.targetDebt

  const swapMulticallItem = encodeSwapMulticallItem({
    handler: SWAPPER_HANDLER_GENERIC,
    mode: BigInt(swapParams.swapperMode),
    account: swapParams.accountOut,
    tokenIn: swapParams.tokenIn.addressInfo,
    tokenOut: swapParams.tokenOut.addressInfo,
    vaultIn: swapParams.vaultIn,
    accountIn: swapParams.accountIn,
    receiver: swapParams.receiver,
    amountOut: swapperAmountOut,
    data: swapData,
  })

  return {
    amountIn,
    amountOut,
    swapMulticallItem,
  }
}

export async function encodeWithdraw(
  swapParams: SwapParams,
  vault: Address,
  amountOut: bigint,
  receiver: Address,
) {
  const amountIn = await fetchPreviewWithdraw(
    swapParams.chainId,
    vault,
    amountOut,
  )

  const abiItem = {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    name: "withdraw",
    stateMutability: "nonpayable",
    type: "function",
  }

  const withdrawData = encodeFunctionData({
    abi: [abiItem],
    args: [amountOut, receiver, swapParams.from],
  })

  const swapData = encodeAbiParameters(parseAbiParameters("address, bytes"), [
    vault,
    withdrawData,
  ])

  const swapperAmountOut =
    swapParams.swapperMode === SwapperMode.EXACT_IN
      ? 0n //ignored
      : swapParams.swapperMode === SwapperMode.EXACT_OUT
        ? amountOut
        : swapParams.targetDebt

  const swapMulticallItem = encodeSwapMulticallItem({
    handler: SWAPPER_HANDLER_GENERIC,
    mode: BigInt(swapParams.swapperMode),
    account: swapParams.accountOut,
    tokenIn: swapParams.tokenIn.addressInfo,
    tokenOut: swapParams.tokenOut.addressInfo,
    vaultIn: swapParams.vaultIn,
    accountIn: swapParams.accountIn,
    receiver: swapParams.receiver,
    amountOut: swapperAmountOut,
    data: swapData,
  })

  return {
    amountIn,
    amountOut,
    swapMulticallItem,
  }
}

export async function encodeMint(
  swapParams: SwapParams,
  vault: Address,
  amountOut: bigint,
  receiver: Address,
) {
  const amountIn = await fetchPreviewMint(swapParams.chainId, vault, amountOut)

  const abiItem = {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    name: "mint",
    stateMutability: "nonpayable",
    type: "function",
  }

  const mintData = encodeFunctionData({
    abi: [abiItem],
    args: [amountOut, receiver],
  })

  const swapData = encodeAbiParameters(parseAbiParameters("address, bytes"), [
    vault,
    mintData,
  ])

  const swapperAmountOut =
    swapParams.swapperMode === SwapperMode.EXACT_IN
      ? 0n //ignored
      : swapParams.swapperMode === SwapperMode.EXACT_OUT
        ? amountOut
        : swapParams.targetDebt

  const swapMulticallItem = encodeSwapMulticallItem({
    handler: SWAPPER_HANDLER_GENERIC,
    mode: BigInt(swapParams.swapperMode),
    account: swapParams.accountOut,
    tokenIn: swapParams.tokenIn.addressInfo,
    tokenOut: swapParams.tokenOut.addressInfo,
    vaultIn: swapParams.vaultIn,
    accountIn: swapParams.accountIn,
    receiver: swapParams.receiver,
    amountOut: swapperAmountOut,
    data: swapData,
  })

  return {
    amountIn,
    amountOut,
    swapMulticallItem,
  }
}

export async function fetchPreviewRedeem(
  chainId: number,
  vault: Address,
  amount: bigint,
) {
  const client = getViemClient(chainId)

  const abiItem = {
    name: "previewRedeem",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  }

  const query = {
    address: vault,
    abi: [abiItem],
    functionName: "previewRedeem",
    args: [amount],
  } as const

  const data = (await client.readContract(query)) as bigint

  return data
}

export async function fetchPreviewWithdraw(
  chainId: number,
  vault: Address,
  amount: bigint,
) {
  const client = getViemClient(chainId)

  const abiItem = {
    name: "previewWithdraw",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  }

  const query = {
    address: vault,
    abi: [abiItem],
    functionName: "previewWithdraw",
    args: [amount],
  } as const

  const data = (await client.readContract(query)) as bigint

  return data
}

export async function fetchPreviewDeposit(
  chainId: number,
  vault: Address,
  amount: bigint,
) {
  const client = getViemClient(chainId)

  const abiItem = {
    name: "previewDeposit",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  }

  const query = {
    address: vault,
    abi: [abiItem],
    functionName: "previewDeposit",
    args: [amount],
  } as const

  const data = (await client.readContract(query)) as bigint

  return data
}

export async function fetchPreviewMint(
  chainId: number,
  vault: Address,
  amount: bigint,
) {
  const client = getViemClient(chainId)

  const abiItem = {
    name: "previewMint",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  }

  const query = {
    address: vault,
    abi: [abiItem],
    functionName: "previewMint",
    args: [amount],
  } as const

  const data = (await client.readContract(query)) as bigint

  return data
}

const getViemClient = (chainId: number) => {
  if (!viemClients[chainId])
    throw new Error(`No client found for chainId ${chainId}`)
  return viemClients[chainId].extend(publicActions)
}
