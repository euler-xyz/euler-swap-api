import { viemClients } from "@/common/utils/viemClients"
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  parseAbiParameters,
  publicActions,
  stringToHex,
} from "viem"
import { SwapperMode } from "../interface"
import type { SwapApiResponse } from "../interface"
import { fetchLiFiExactOutQuote } from "../quoters"
import { runPipeline } from "../runner"
import type { StrategyResult, SwapParams } from "../types"
import {
  SWAPPER_HANDLER_GENERIC,
  adjustForInterest,
  buildApiResponseSwap,
  buildApiResponseVerifyDebtMax,
  buildApiResponseVerifySkimMin,
  encodeDepositMulticallItem,
  encodeERC20TransferMulticallItem,
  encodeSwapMulticallItem,
  findToken,
  isExactInRepay,
  matchParams,
  quoteToRoute,
} from "../utils"

export const MTBILL_MAINNET = "0xdd629e5241cbc5919847783e6c96b2de4754e438"

// TODO move to config
const MTBILL_REDEMPTION_FEE_BPS = 7n
const MTBILL_DEPOSITOR_MAINNET = "0x99361435420711723af805f08187c9e6bf796683"
const MTBILL_REDEEMER_MAINNET = "0x569d7dccbf6923350521ecbc28a555a500c4f0ec"
const MTBILL_ORACLE_MAINNET = "0x056339C044055819E8Db84E71f5f2E1F536b2E5b"
const MTBILL_USD_PRICE_ONE = 100000000n
const USDC_MAINNET = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const USDC_ESCROW_VAULT_MAINNET: Address =
  "0xb93d4928f39fbcd6c89a7dfbf0a867e6344561be"

const MTBILL_ROUTE = { providerName: "mTBILL" }

const isMTBILL = (addr: string) =>
  isAddressEqual(getAddress(addr), MTBILL_MAINNET)

export class StrategyMTBILL {
  static name() {
    return "mtbill"
  }
  readonly match
  readonly config

  constructor(match = {}, config = {}) {
    this.match = match
    this.config = config
  }

  async supports(swapParams: SwapParams) {
    return (
      !isExactInRepay(swapParams) &&
      swapParams.chainId === 1 &&
      (isAddressEqual(swapParams.tokenIn.addressInfo, MTBILL_MAINNET) ||
        isAddressEqual(swapParams.tokenOut.addressInfo, MTBILL_MAINNET))
    )
  }

  async findSwap(swapParams: SwapParams): Promise<StrategyResult> {
    const result: StrategyResult = {
      strategy: StrategyMTBILL.name(),
      supports: await this.supports(swapParams),
      match: matchParams(swapParams, this.match),
    }

    if (!result.supports || !result.match) return result

    try {
      switch (swapParams.swapperMode) {
        case SwapperMode.EXACT_IN: {
          if (isMTBILL(swapParams.tokenIn.addressInfo)) {
            if (isAddressEqual(swapParams.tokenOut.addressInfo, USDC_MAINNET)) {
              result.response = await this.exactInFromMTokenToUSDC(swapParams)
            } else {
              result.response = await this.exactInFromMTokenToAny(swapParams)
            }
          } else {
            if (isAddressEqual(swapParams.tokenIn.addressInfo, USDC_MAINNET)) {
              result.response = await this.exactInToMTokenFromUSDC(swapParams)
            } else {
              result.response = await this.exactInToMTokenFromAny(swapParams)
            }
          }
          break
        }
        case SwapperMode.TARGET_DEBT: {
          if (isMTBILL(swapParams.tokenIn.addressInfo)) {
            if (isAddressEqual(swapParams.tokenOut.addressInfo, USDC_MAINNET)) {
              result.response =
                await this.targetDebtFromMTokenToUSDC(swapParams)
            } else {
              result.response = await this.targetDebtFromMTokenToAny(swapParams)
            }
          } else {
            if (isAddressEqual(swapParams.tokenIn.addressInfo, USDC_MAINNET)) {
              result.response =
                await this.targetDebtToMTokenFromUSDC(swapParams)
            } else {
              result.response = await this.targetDebtToMTokenFromAny(swapParams)
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

  async exactInFromMTokenToUSDC(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const {
      swapMulticallItem: redeemInstantMulticallItem,
      amountOut: redeemInstantAmountOut,
    } = await encodeMTBILLRedeemInstant(
      swapParams,
      swapParams.amount,
      true,
      getAddress(USDC_MAINNET),
    )

    // redeeming into USDC is the actual swap
    const multicallItems = [redeemInstantMulticallItem]

    if (!isAddressEqual(swapParams.receiver, swapParams.from)) {
      const transferMulticallItem = encodeERC20TransferMulticallItem(
        USDC_MAINNET,
        redeemInstantAmountOut,
        swapParams.receiver,
      )
      multicallItems.push(transferMulticallItem)
    }

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifySkimMin(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      redeemInstantAmountOut,
      swapParams.deadline,
    )

    return {
      amountIn: String(swapParams.amount),
      amountInMax: String(swapParams.amount),
      amountOut: String(redeemInstantAmountOut),
      amountOutMin: String(redeemInstantAmountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: 0,
      route: [MTBILL_ROUTE],
      swap,
      verify,
    }
  }

  async exactInFromMTokenToAny(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const {
      swapMulticallItem: redeemInstantMulticallItem,
      amountOut: redeemInstantAmountOut,
    } = await encodeMTBILLRedeemInstant(
      swapParams,
      swapParams.amount,
      true,
      getAddress(USDC_MAINNET),
    )

    const innerSwapParams = {
      ...swapParams,
      tokenIn: findToken(swapParams.chainId, USDC_MAINNET),
      amount: redeemInstantAmountOut,
    }

    const innerSwap = await runPipeline(innerSwapParams)

    const multicallItems = [
      redeemInstantMulticallItem,
      ...innerSwap.swap.multicallItems,
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
      route: [MTBILL_ROUTE, ...innerSwap.route],
      swap,
      verify,
    }
  }

  async exactInToMTokenFromUSDC(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const {
      swapMulticallItem: depositInstantMulticallItem,
      amountOut: depositInstantAmountOut,
    } = await encodeMTBILLDepositInstant(
      swapParams,
      swapParams.amount,
      false,
      USDC_MAINNET,
    )

    const transferMulticallItem = encodeERC20TransferMulticallItem(
      MTBILL_MAINNET,
      depositInstantAmountOut,
      swapParams.receiver,
    )

    const multicallItems = [depositInstantMulticallItem, transferMulticallItem]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifySkimMin(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      depositInstantAmountOut,
      swapParams.deadline,
    )

    return {
      amountIn: String(swapParams.amount),
      amountInMax: String(swapParams.amount),
      amountOut: String(depositInstantAmountOut),
      amountOutMin: String(depositInstantAmountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: 0,
      route: [MTBILL_ROUTE],
      swap,
      verify,
    }
  }

  async exactInToMTokenFromAny(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const innerSwapParams = {
      ...swapParams,
      tokenOut: findToken(swapParams.chainId, USDC_MAINNET),
      receiver: swapParams.from,
    }

    const innerSwap = await runPipeline(innerSwapParams)

    const {
      swapMulticallItem: depositInstantMulticallIem,
      amountOut: depositInstantAmountOut,
    } = await encodeMTBILLDepositInstant(
      swapParams,
      BigInt(innerSwap.amountOutMin),
      false,
      USDC_MAINNET,
    )

    const transferMulticallItem = encodeERC20TransferMulticallItem(
      MTBILL_MAINNET,
      depositInstantAmountOut,
      swapParams.receiver,
    )

    const intermediateDustDepositMulticallItem = encodeDepositMulticallItem(
      USDC_MAINNET,
      USDC_ESCROW_VAULT_MAINNET,
      1n,
      swapParams.accountOut,
    )

    const multicallItems = [
      ...innerSwap.swap.multicallItems,
      depositInstantMulticallIem,
      transferMulticallItem,
      intermediateDustDepositMulticallItem,
    ]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)
    const verify = buildApiResponseVerifySkimMin(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      depositInstantAmountOut,
      swapParams.deadline,
    )

    return {
      amountIn: String(swapParams.amount),
      amountInMax: String(swapParams.amount),
      amountOut: String(depositInstantAmountOut),
      amountOutMin: String(depositInstantAmountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [MTBILL_ROUTE, ...innerSwap.route],
      swap,
      verify,
    }
  }

  async targetDebtFromMTokenToUSDC(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    // TODO expects USDC dust - add to dust list

    const redeemAmount = (swapParams.amount * 100_001n) / 100_000n // a bit extra for accrued interest

    const {
      swapMulticallItem: redeemInstantMulticallItem,
      amountIn,
      amountOut,
    } = await encodeMTBILLRedeemInstant(
      swapParams,
      redeemAmount,
      false,
      USDC_MAINNET,
    )

    const multicallItems = [redeemInstantMulticallItem]

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
      route: [MTBILL_ROUTE],
      swap,
      verify,
    }
  }

  async targetDebtFromMTokenToAny(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const lifiSwapParams = {
      ...swapParams,
      tokenIn: findToken(swapParams.chainId, USDC_MAINNET),
      receiver: swapParams.from,
    }
    const lifiQuote = await fetchLiFiExactOutQuote(lifiSwapParams)

    const lifiSwapMulticallItem = encodeSwapMulticallItem({
      handler: SWAPPER_HANDLER_GENERIC,
      mode: BigInt(SwapperMode.TARGET_DEBT), // will deposit overswap from lifi, and also USDC although it shouldn't be necessary
      account: swapParams.accountOut,
      tokenIn: swapParams.tokenIn.addressInfo,
      tokenOut: swapParams.tokenOut.addressInfo,
      vaultIn: swapParams.vaultIn,
      accountIn: swapParams.accountIn,
      receiver: swapParams.receiver,
      amountOut: swapParams.targetDebt,
      data: lifiQuote.data,
    })

    const redeemSwapParams = {
      ...swapParams,
      swapperMode: SwapperMode.EXACT_IN, // change to exact in, otherwise multicall item will be target debt and will attempt a repay
    }
    const {
      swapMulticallItem: redeemInstantMulticallItem,
      amountIn: redeemInstantAmountIn,
    } = await encodeMTBILLRedeemInstant(
      redeemSwapParams,
      lifiQuote.amountIn,
      false,
      USDC_MAINNET,
    )

    const multicallItems = [redeemInstantMulticallItem, lifiSwapMulticallItem]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifyDebtMax(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      swapParams.targetDebt,
      swapParams.deadline,
    )

    return {
      amountIn: String(redeemInstantAmountIn),
      amountInMax: String(redeemInstantAmountIn),
      amountOut: String(lifiQuote.amountOut),
      amountOutMin: String(lifiQuote.amountOutMin),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [MTBILL_ROUTE, ...quoteToRoute(lifiQuote)],
      swap,
      verify,
    }
  }

  async targetDebtToMTokenFromUSDC(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const depositInstantAmount = adjustForInterest(swapParams.amount) // TODO move to config, helper

    const {
      swapMulticallItem: depositInstantMulticallItem,
      amountIn,
      amountOut,
    } = await encodeMTBILLDepositInstant(
      swapParams,
      depositInstantAmount,
      true,
      USDC_MAINNET,
    )

    // deposit instant is encoded in target debt mode, so repay will happen automatically
    const multicallItems = [depositInstantMulticallItem]

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
      amountInMax: String(amountIn),
      amountOut: String(amountOut),
      amountOutMin: String(amountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [MTBILL_ROUTE],
      swap,
      verify,
    }
  }

  async targetDebtToMTokenFromAny(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const targetDeposit = adjustForInterest(swapParams.amount) // TODO move to config, helper

    const swapParamsDeposit = {
      ...swapParams,
      tokenIn: findToken(swapParams.chainId, USDC_MAINNET),
      vaultIn: USDC_ESCROW_VAULT_MAINNET,
    }
    const {
      swapMulticallItem: depositInstantMulticallItem,
      amountIn: depositInstantAmountIn,
      amountOut,
    } = await encodeMTBILLDepositInstant(
      swapParamsDeposit,
      targetDeposit,
      true,
      USDC_MAINNET,
    )

    const lifiSwapParams = {
      ...swapParams,
      amount: depositInstantAmountIn,
      tokenOut: findToken(swapParams.chainId, USDC_MAINNET),
      swapperMode: SwapperMode.EXACT_IN,
      receiver: swapParams.from,
    }
    const lifiQuote = await fetchLiFiExactOutQuote(lifiSwapParams)
    const lifiSwapMulticallItem = encodeSwapMulticallItem({
      handler: SWAPPER_HANDLER_GENERIC,
      mode: BigInt(SwapperMode.EXACT_IN),
      account: swapParams.accountOut,
      tokenIn: swapParams.tokenIn.addressInfo,
      tokenOut: swapParams.tokenOut.addressInfo,
      vaultIn: swapParams.vaultIn,
      accountIn: swapParams.accountIn,
      receiver: lifiSwapParams.receiver,
      amountOut: 0n, // ignored
      data: lifiQuote.data,
    })
    // deposit instant is encoded in target debt mode, so repay will happen automatically
    const multicallItems = [lifiSwapMulticallItem, depositInstantMulticallItem]

    const swap = buildApiResponseSwap(swapParams.from, multicallItems)

    const verify = buildApiResponseVerifyDebtMax(
      swapParams.chainId,
      swapParams.receiver,
      swapParams.accountOut,
      swapParams.targetDebt,
      swapParams.deadline,
    )

    return {
      amountIn: String(lifiQuote.amountIn),
      amountInMax: String(lifiQuote.amountIn),
      amountOut: String(amountOut),
      amountOutMin: String(amountOut),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [...quoteToRoute(lifiQuote), MTBILL_ROUTE],
      swap,
      verify,
    }
  }
}

export async function encodeMTBILLRedeemInstant(
  swapParams: SwapParams,
  amount: bigint,
  isAmountMTBILL: boolean,
  tokenOut: Address,
) {
  // assuming USDC/USD is within 10bps, mTBILL considers it on peg
  // and allows instant redemptions with a 7bps fee

  const mTBILLPriceUSD = await fetchMTBILLPrice(swapParams.chainId)

  let amountIn
  let amountOut
  let amountOutMin

  const scale = 10n ** 12n
  if (isAmountMTBILL) {
    const fee = (amount * MTBILL_REDEMPTION_FEE_BPS) / 10_000n
    amountIn = amount
    amountOutMin = ((amount - fee) * mTBILLPriceUSD) / MTBILL_USD_PRICE_ONE
    amountOut = amountOutMin / scale
  } else {
    amountIn =
      (scale * amount * 10_000n * MTBILL_USD_PRICE_ONE) /
        (10_000n - MTBILL_REDEMPTION_FEE_BPS) /
        mTBILLPriceUSD +
      1n // +1 fixes rounding issues
    amountOut = amount
    amountOutMin = amountOut * scale
  }

  const abiItem = {
    inputs: [
      { name: "tokenOut", type: "address" },
      { name: "amountMTokenIn", type: "uint256" },
      { name: "minReceiveAmount", type: "uint256" },
    ],
    name: "redeemInstant",
    stateMutability: "nonpayable",
    type: "function",
  }

  const redeemInstantData = encodeFunctionData({
    abi: [abiItem],
    args: [tokenOut, amountIn, amountOutMin],
  })

  const swapData = encodeAbiParameters(parseAbiParameters("address, bytes"), [
    MTBILL_REDEEMER_MAINNET,
    redeemInstantData,
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

export async function encodeMTBILLDepositInstant(
  swapParams: SwapParams,
  amount: bigint,
  isAmountMTBILL: boolean,
  tokenIn: Address,
) {
  const abiItem = {
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "amountToken", type: "uint256" },
      { name: "minReceiveAmount", type: "uint256" },
      { name: "referrerId", type: "bytes32" },
    ],
    name: "depositInstant",
    stateMutability: "nonpayable",
    type: "function",
  }

  const zeroBytes32 = stringToHex("", {
    size: 32,
  })

  const scale = 10n ** 12n

  const mTBILLPriceUSD = await fetchMTBILLPrice(swapParams.chainId)

  let amountIn
  let depositAmount
  let amountOut
  if (isAmountMTBILL) {
    amountOut = amount
    depositAmount = (amount * mTBILLPriceUSD) / MTBILL_USD_PRICE_ONE
    // clear out decimals over 6
    depositAmount = (depositAmount / scale) * scale
    amountIn = depositAmount / scale
    amountOut = (depositAmount * MTBILL_USD_PRICE_ONE) / mTBILLPriceUSD
  } else {
    amountIn = amount
    console.log("amountIn: ", amountIn)
    depositAmount = amountIn * scale
    console.log("depositAmount: ", depositAmount)
    amountOut = (depositAmount * MTBILL_USD_PRICE_ONE) / mTBILLPriceUSD
    console.log("mTBILLPriceUSD: ", mTBILLPriceUSD)
    console.log("amountOut: ", amountOut)
  }

  const depositInstantData = encodeFunctionData({
    abi: [abiItem],
    args: [tokenIn, depositAmount, amountOut, zeroBytes32],
  })

  const swapData = encodeAbiParameters(parseAbiParameters("address, bytes"), [
    MTBILL_DEPOSITOR_MAINNET,
    depositInstantData,
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
    tokenIn: tokenIn,
    tokenOut: MTBILL_MAINNET,
    vaultIn: swapParams.vaultIn,
    accountIn: swapParams.accountIn,
    receiver: swapParams.receiver,
    amountOut: swapperAmountOut,
    data: swapData,
  })

  return {
    amountOut,
    amountIn,
    swapMulticallItem,
  }
}

export async function fetchMTBILLPrice(chainId: number) {
  if (!viemClients[chainId])
    throw new Error(`No client found for chainId ${chainId}`)
  const client = viemClients[chainId].extend(publicActions)

  viemClients[chainId]

  const abiItem = {
    name: "lastAnswer",
    outputs: [{ name: "", type: "int256" }],
    stateMutability: "view",
    type: "function",
  }

  const query = {
    address: MTBILL_ORACLE_MAINNET,
    abi: [abiItem],
    functionName: "lastAnswer",
  } as const

  const data = (await client.readContract(query)) as bigint
  if (data <= 0) throw new Error("Invalid mTBILL price")

  return data
}
