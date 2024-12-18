import type { TokenListItem } from "@/common/utils/tokenList"
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
import { base, mainnet } from "viem/chains"
import { SwapperMode } from "../interface"
import type { SwapApiResponse } from "../interface"
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
} from "../utils"

type MTokenConfig = {
  tokenContract: Address
  redemptionInstantFeeBps: bigint
  depositorContract: Address
  redeemerContract: Address
  oracleContract: Address
  paymentToken: Address
  paymentTokenSweepVault: Address
  priceOne: bigint
  isChronicleOracle?: boolean
}
type Config = {
  mTokens: {
    [chain: number]: {
      [tokenName: string]: MTokenConfig
    }
  }
}

const defaultConfig: Config = {
  // https://docs.midas.app/resources/smart-contracts-addresses
  mTokens: {
    [mainnet.id]: {
      mTBILL: {
        tokenContract: "0xdd629e5241cbc5919847783e6c96b2de4754e438",
        redemptionInstantFeeBps: 7n,
        depositorContract: "0x99361435420711723af805f08187c9e6bf796683",
        redeemerContract: "0x569d7dccbf6923350521ecbc28a555a500c4f0ec",
        oracleContract: "0x056339C044055819E8Db84E71f5f2E1F536b2E5b",
        paymentToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
        paymentTokenSweepVault: "0xb93d4928f39fbcd6c89a7dfbf0a867e6344561be", // USDC-1 escrow
        priceOne: 100000000n,
      },
      mBTC: {
        tokenContract: "0x007115416AB6c266329a03B09a8aa39aC2eF7d9d",
        redemptionInstantFeeBps: 7n,
        depositorContract: "0x10cC8dbcA90Db7606013d8CD2E77eb024dF693bD",
        redeemerContract: "0x30d9D1e76869516AEa980390494AaEd45C3EfC1a",
        oracleContract: "0xA537EF0343e83761ED42B8E017a1e495c9a189Ee",
        paymentToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
        paymentTokenSweepVault: "0x598513C77236Bd5821CCC7bc3E3a585F3FeC9fb1", // WBTC-1 escrow
        priceOne: 100000000n,
      },
      mBASIS: {
        tokenContract: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656",
        redemptionInstantFeeBps: 50n,
        depositorContract: "0xa8a5c4FF4c86a459EBbDC39c5BE77833B3A15d88",
        redeemerContract: "0x0D89C1C4799353F3805A3E6C4e1Cbbb83217D123",
        oracleContract: "0xE4f2AE539442e1D3Fb40F03ceEbF4A372a390d24",
        paymentToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
        paymentTokenSweepVault: "0xb93d4928f39fbcd6c89a7dfbf0a867e6344561be", // USDC-1 escrow
        priceOne: 100000000n,
      },
    },

    [base.id]: {
      // mTBILL: {
      //   tokenContract: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
      //   redemptionInstantFeeBps: 7n,
      //   depositorContract: "0x8978e327FE7C72Fa4eaF4649C23147E279ae1470",
      //   redeemerContract: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656",
      //   oracleContract: "0x70E58b7A1c884fFFE7dbce5249337603a28b8422",
      //   paymentToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      //   paymentTokenSweepVault: "", // USDC-1 escrow
      //   priceOne: 1000000000000000000n,
      //   isChronicleOracle: true,
      // },
      // mBASIS: {
      //   tokenContract: "0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2",
      //   redemptionInstantFeeBps: 50n,
      //   depositorContract: "0x80b666D60293217661E7382737bb3E42348f7CE5",
      //   redeemerContract: "0xF804a646C034749b5484bF7dfE875F6A4F969840",
      //   oracleContract: "0x6d62D3C3C8f9912890788b50299bF4D2C64823b6",
      //   paymentToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      //   paymentTokenSweepVault: "", // USDC-1 escrow
      //   priceOne: 100000000n,
      // },
    },
  },
}

const MIDAS_ROUTE = { providerName: "Midas" }

const isMToken = (mToken: MTokenConfig, addr: string) =>
  isAddressEqual(mToken.tokenContract, getAddress(addr))

export class StrategyMidas {
  static name() {
    return "midas"
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
      !!(
        this.findMTokenConfig(
          swapParams.chainId,
          swapParams.tokenIn.addressInfo,
        ) ||
        this.findMTokenConfig(
          swapParams.chainId,
          swapParams.tokenOut.addressInfo,
        )
      )
    )
  }

  async findSwap(swapParams: SwapParams): Promise<StrategyResult> {
    const result: StrategyResult = {
      strategy: StrategyMidas.name(),
      supports: await this.supports(swapParams),
      match: matchParams(swapParams, this.match),
    }

    if (!result.supports || !result.match) return result

    const mToken = this.getMToken(swapParams)

    try {
      switch (swapParams.swapperMode) {
        case SwapperMode.EXACT_IN: {
          if (isMToken(mToken, swapParams.tokenIn.addressInfo)) {
            if (
              isAddressEqual(
                swapParams.tokenOut.addressInfo,
                mToken.paymentToken,
              )
            ) {
              result.response =
                await this.exactInFromMTokenToPaymentToken(swapParams)
            } else {
              result.response = await this.exactInFromMTokenToAny(swapParams)
            }
          } else {
            if (
              isAddressEqual(
                swapParams.tokenIn.addressInfo,
                mToken.paymentToken,
              )
            ) {
              result.response =
                await this.exactInFromPaymentTokenToMToken(swapParams)
            } else {
              result.response = await this.exactInFromAnyToMToken(swapParams)
            }
          }
          break
        }
        case SwapperMode.TARGET_DEBT: {
          if (isMToken(mToken, swapParams.tokenIn.addressInfo)) {
            if (
              isAddressEqual(
                swapParams.tokenOut.addressInfo,
                mToken.paymentToken,
              )
            ) {
              result.response =
                await this.targetDebtFromMTokenToPaymentToken(swapParams)
            } else {
              result.response = await this.targetDebtFromMTokenToAny(swapParams)
            }
          } else {
            if (
              isAddressEqual(
                swapParams.tokenIn.addressInfo,
                mToken.paymentToken,
              )
            ) {
              result.response =
                await this.targetDebtFromPaymentTokenToMToken(swapParams)
            } else {
              result.response = await this.targetDebtFromAnyToMToken(swapParams)
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

  async exactInFromMTokenToPaymentToken(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const mToken = this.getMToken(swapParams)
    const {
      swapMulticallItem: redeemInstantMulticallItem,
      amountOut: redeemInstantAmountOut,
    } = await this.encodeMTBILLRedeemInstant(
      swapParams,
      swapParams.amount,
      true,
      getAddress(mToken.paymentToken),
    )

    // redeeming into USDC is the actual swap
    const multicallItems = [redeemInstantMulticallItem]

    if (!isAddressEqual(swapParams.receiver, swapParams.from)) {
      const transferMulticallItem = encodeERC20TransferMulticallItem(
        mToken.paymentToken,
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
      route: [MIDAS_ROUTE],
      swap,
      verify,
    }
  }

  async exactInFromMTokenToAny(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const mToken = this.getMToken(swapParams)

    const {
      swapMulticallItem: redeemInstantMulticallItem,
      amountOut: redeemInstantAmountOut,
    } = await this.encodeMTBILLRedeemInstant(
      swapParams,
      swapParams.amount,
      true,
      getAddress(mToken.paymentToken),
    )

    const innerSwapParams = {
      ...swapParams,
      tokenIn: findToken(
        swapParams.chainId,
        mToken.paymentToken,
      ) as TokenListItem,
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
      route: [MIDAS_ROUTE, ...innerSwap.route],
      swap,
      verify,
    }
  }

  async exactInFromPaymentTokenToMToken(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const mToken = this.getMToken(swapParams)

    const {
      swapMulticallItem: depositInstantMulticallItem,
      amountOut: depositInstantAmountOut,
    } = await this.encodeMTBILLDepositInstant(
      swapParams,
      swapParams.amount,
      false,
      mToken.paymentToken,
    )

    const transferMulticallItem = encodeERC20TransferMulticallItem(
      mToken.tokenContract,
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
      route: [MIDAS_ROUTE],
      swap,
      verify,
    }
  }

  async exactInFromAnyToMToken(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const mToken = this.getMToken(swapParams)

    const innerSwapParams = {
      ...swapParams,
      tokenOut: findToken(
        swapParams.chainId,
        mToken.paymentToken,
      ) as TokenListItem,
      receiver: swapParams.from,
    }

    const innerSwap = await runPipeline(innerSwapParams)

    const {
      swapMulticallItem: depositInstantMulticallIem,
      amountOut: depositInstantAmountOut,
    } = await this.encodeMTBILLDepositInstant(
      swapParams,
      BigInt(innerSwap.amountOutMin),
      false,
      mToken.paymentToken,
    )

    const transferMulticallItem = encodeERC20TransferMulticallItem(
      mToken.tokenContract,
      depositInstantAmountOut,
      swapParams.receiver,
    )

    const intermediateDustDepositMulticallItem = encodeDepositMulticallItem(
      mToken.paymentToken,
      mToken.paymentTokenSweepVault,
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
      route: [MIDAS_ROUTE, ...innerSwap.route],
      swap,
      verify,
    }
  }

  async targetDebtFromMTokenToPaymentToken(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    // TODO expects USDC dust - add to dust list
    const mToken = this.getMToken(swapParams)

    const redeemAmount = (swapParams.amount * 100_001n) / 100_000n // a bit extra for accrued interest

    const {
      swapMulticallItem: redeemInstantMulticallItem,
      amountIn,
      amountOut,
    } = await this.encodeMTBILLRedeemInstant(
      swapParams,
      redeemAmount,
      false,
      mToken.paymentToken,
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
      route: [MIDAS_ROUTE],
      swap,
      verify,
    }
  }

  async targetDebtFromMTokenToAny(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const mToken = this.getMToken(swapParams)

    const innerSwapParams = {
      ...swapParams,
      tokenIn: findToken(
        swapParams.chainId,
        mToken.paymentToken,
      ) as TokenListItem,
      vaultIn: mToken.paymentTokenSweepVault,
      onlyFixedInputExactOut: true, // eliminate dust in the intermediate asset (vault underlying)
    }
    const innerQuote = await runPipeline(innerSwapParams)

    const redeemSwapParams = {
      ...swapParams,
      swapperMode: SwapperMode.EXACT_IN, // change to exact in, otherwise multicall item will be target debt and will attempt a repay
    }
    const {
      swapMulticallItem: redeemInstantMulticallItem,
      amountIn: redeemInstantAmountIn,
    } = await this.encodeMTBILLRedeemInstant(
      redeemSwapParams,
      BigInt(innerQuote.amountIn),
      false,
      mToken.paymentToken,
    )

    const multicallItems = [
      redeemInstantMulticallItem,
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
      amountIn: String(redeemInstantAmountIn),
      amountInMax: String(redeemInstantAmountIn),
      amountOut: String(innerQuote.amountOut),
      amountOutMin: String(innerQuote.amountOutMin),
      vaultIn: swapParams.vaultIn,
      receiver: swapParams.receiver,
      accountIn: swapParams.accountIn,
      accountOut: swapParams.accountOut,
      tokenIn: swapParams.tokenIn,
      tokenOut: swapParams.tokenOut,
      slippage: swapParams.slippage,
      route: [MIDAS_ROUTE, ...innerQuote.route],
      swap,
      verify,
    }
  }

  async targetDebtFromPaymentTokenToMToken(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const mToken = this.getMToken(swapParams)

    const depositInstantAmount = adjustForInterest(swapParams.amount)

    const {
      swapMulticallItem: depositInstantMulticallItem,
      amountIn,
      amountOut,
    } = await this.encodeMTBILLDepositInstant(
      swapParams,
      depositInstantAmount,
      true,
      mToken.paymentToken,
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
      route: [MIDAS_ROUTE],
      swap,
      verify,
    }
  }

  async targetDebtFromAnyToMToken(
    swapParams: SwapParams,
  ): Promise<SwapApiResponse> {
    const mToken = this.getMToken(swapParams)

    const targetDeposit = adjustForInterest(swapParams.amount)

    const depositSwapParams = {
      ...swapParams,
      tokenIn: findToken(
        swapParams.chainId,
        mToken.paymentToken,
      ) as TokenListItem,
      vaultIn: mToken.paymentTokenSweepVault,
    }
    const {
      swapMulticallItem: depositInstantMulticallItem,
      amountIn: depositInstantAmountIn,
      amountOut,
    } = await this.encodeMTBILLDepositInstant(
      depositSwapParams,
      targetDeposit,
      true,
      mToken.paymentToken,
    )

    const innerSwapParams = {
      ...swapParams,
      amount: depositInstantAmountIn,
      tokenOut: findToken(
        swapParams.chainId,
        mToken.paymentToken,
      ) as TokenListItem,
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

    // repay is done through deposit item, which will return unused input, which is the intermediate asset
    const multicallItems = [...innerSwapItems, depositInstantMulticallItem]

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
      route: [...innerQuote.route, MIDAS_ROUTE],
      swap,
      verify,
    }
  }

  async encodeMTBILLRedeemInstant(
    swapParams: SwapParams,
    amount: bigint,
    isAmountMToken: boolean,
    tokenOut: Address,
  ) {
    // assuming USDC/USD is within 10bps, mTBILL considers it on peg
    // and allows instant redemptions with a 7bps fee

    const mToken = this.getMToken(swapParams)
    const paymentTokenDecimals = BigInt(
      findToken(swapParams.chainId, mToken.paymentToken)?.decimals || 18,
    )

    const mTBILLPriceUSD = await fetchMTokenPrice(swapParams.chainId, mToken)

    let amountIn
    let amountOut
    let amountOutMin

    const scale = 10n ** (18n - paymentTokenDecimals)
    if (isAmountMToken) {
      const fee = (amount * mToken.redemptionInstantFeeBps) / 10_000n
      amountIn = amount
      amountOutMin =
        (((amount - fee) * mTBILLPriceUSD) / mToken.priceOne / scale) * scale // truncate above payment token decimals
      amountOut = amountOutMin / scale
    } else {
      amountIn =
        (scale * amount * 10_000n * mToken.priceOne) /
          (10_000n - mToken.redemptionInstantFeeBps) /
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
      mToken.redeemerContract,
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

  async encodeMTBILLDepositInstant(
    swapParams: SwapParams,
    amount: bigint,
    isAmountMToken: boolean,
    tokenIn: Address,
  ) {
    const mToken = this.getMToken(swapParams)
    const paymentTokenDecimals = BigInt(
      findToken(swapParams.chainId, mToken.paymentToken)?.decimals || 18,
    )

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

    const scale = 10n ** (18n - paymentTokenDecimals)

    const mTBILLPriceUSD = await fetchMTokenPrice(swapParams.chainId, mToken)

    let amountIn
    let depositAmount
    let amountOut
    if (isAmountMToken) {
      amountOut = amount
      depositAmount = (amount * mTBILLPriceUSD) / mToken.priceOne
      // clear out decimals over 6
      depositAmount = (depositAmount / scale) * scale
      amountIn = depositAmount / scale
      amountOut = (depositAmount * mToken.priceOne) / mTBILLPriceUSD
    } else {
      amountIn = amount
      depositAmount = amountIn * scale
      amountOut = (depositAmount * mToken.priceOne) / mTBILLPriceUSD
    }

    const depositInstantData = encodeFunctionData({
      abi: [abiItem],
      args: [tokenIn, depositAmount, amountOut, zeroBytes32],
    })

    const swapData = encodeAbiParameters(parseAbiParameters("address, bytes"), [
      mToken.depositorContract,
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
      tokenOut: mToken.tokenContract,
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

  findMTokenConfig(chainId: number, address: Address) {
    if (this.config.mTokens[chainId]) {
      const found = Object.entries(this.config.mTokens[chainId]).find(
        ([_, data]) => {
          return isAddressEqual(data.tokenContract, address)
        },
      )
      if (found) {
        return {
          name: found[0],
          ...found[1],
        }
      }
    }
  }

  getMToken(swapParams: SwapParams): MTokenConfig {
    const mToken =
      this.findMTokenConfig(
        swapParams.chainId,
        swapParams.tokenIn.addressInfo,
      ) ||
      this.findMTokenConfig(swapParams.chainId, swapParams.tokenOut.addressInfo)
    if (!mToken) throw new Error("MToken not found")

    return mToken
  }
}

// TODO latestAnswer on base
export async function fetchMTokenPrice(chainId: number, mToken: MTokenConfig) {
  if (!viemClients[chainId])
    throw new Error(`No client found for chainId ${chainId}`)
  const client = viemClients[chainId].extend(publicActions)
  // console.log('viemClients: ', viemClients[1]);

  const fn = mToken.isChronicleOracle ? "latestAnswer" : "lastAnswer"

  const abiItem = {
    name: fn,
    outputs: [{ name: "", type: "int256" }],
    stateMutability: "view",
    type: "function",
  }

  const query = {
    address: mToken.oracleContract,
    abi: [abiItem],
    functionName: fn,
  } as const
  let data
  try {
    data = (await client.readContract(query)) as bigint
    if (data <= 0) throw new Error("Invalid mTBILL price")
  } catch (err) {
    console.log(err)
    throw new Error(`Failed fetching ${mToken.tokenContract} price`)
  }

  return data
}
