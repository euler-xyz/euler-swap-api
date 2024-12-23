// import * as chains from "viem/chains"
// import { SwapperMode } from "../interface"
// import { fetch1InchQuote } from "../quoters/quoter1Inch"
// import type { StrategyResult, SwapParams } from "../types"
// import { buildApiResponseExactInputFromQuote, matchParams } from "../utils"

// export const defaultConfig = {
//   chainsSupported: [
//     chains.arbitrum.id,
//     chains.aurora.id,
//     chains.avalanche.id,
//     chains.mainnet.id,
//     chains.base.id,
//     chains.bsc.id,
//     chains.zksync.id,
//     chains.fantom.id,
//     chains.gnosis.id,
//     chains.klaytn.id,
//     chains.optimism.id,
//     chains.polygon.id,
//   ] as number[],
// }

// export class Strategy1Inch {
//   static name() {
//     return "1inch"
//   }
//   readonly match
//   readonly config

//   constructor(match = {}, config = defaultConfig) {
//     this.match = match
//     this.config = config
//   }

//   async supports(swapParams: SwapParams) {
//     return (
//       this.config.chainsSupported.includes(swapParams.chainId) &&
//       !swapParams.isRepay &&
//       swapParams.swapperMode === SwapperMode.EXACT_IN
//     )
//   }

//   async findSwap(swapParams: SwapParams): Promise<StrategyResult> {
//     const result: StrategyResult = {
//       strategy: Strategy1Inch.name(),
//       supports: await this.supports(swapParams),
//       match: matchParams(swapParams, this.match),
//     }

//     if (!result.supports || !result.match) return result

//     try {
//       const quote = await fetch1InchQuote(swapParams)

//       result.response = buildApiResponseExactInputFromQuote(swapParams, quote)
//     } catch (error) {
//       result.error = error instanceof Error ? error.message : error
//     }

//     return result
//   }
// }
