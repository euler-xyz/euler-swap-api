import { StatusCodes } from "http-status-codes"
import { getRoutingConfig } from "./config"
import type {
  ChainRoutingConfig,
  RoutingItem,
  SwapApiResponse,
} from "./interface"
import { strategies } from "./strategies/index"
import type { StrategyResult, SwapParams } from "./types"
import { ApiError } from "./utils"

function loadPipeline(swapParams: SwapParams) {
  let routing: ChainRoutingConfig
  if (swapParams.routingOverride) {
    routing = swapParams.routingOverride
  } else {
    routing = getRoutingConfig(swapParams.chainId)
    if (!routing)
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Routing config not found for chainId",
      )
  }

  return routing.map((routingItem: RoutingItem) => {
    return new strategies[routingItem.strategy](
      routingItem.match,
      routingItem.config,
    )
  })
}

export async function runPipeline(
  swapParams: SwapParams,
): Promise<SwapApiResponse> {
  const pipeline = loadPipeline(swapParams)

  const allResults: StrategyResult[] = []
  for (const strategy of pipeline) {
    const result = await strategy.findSwap(swapParams)
    allResults.push(result)
    if (result.response) break
  }

  console.log(allResults)

  const finalResult = allResults.at(-1)
  if (!finalResult)
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Pipeline empty or result not found",
    )
  if (!finalResult.response) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Swap quote not found",
      allResults,
    )
  }

  // console.log(
  //   "finalResult.response: ",
  //   JSON.stringify(finalResult.response, null, 2),
  // )
  return finalResult.response
}

// TODO timeouts on balmy
// TODO review and add sources
// TODO tokenlist, interfaces
// TODO price impact
// TODO logging - detect when fallback kicks
// In wreapper strategy return dust to the original wrapper asset - deposit for EOA owner
