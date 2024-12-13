import { StatusCodes } from "http-status-codes"
import routingConfig from "./config"
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
    routing = routingConfig[String(swapParams.chainId)]
    if (!routing)
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Routing config not found for chainId",
      )
  }

  return routing.map((routingItem: RoutingItem) => {
    return new strategies[routingItem.strategy](
      routingItem.match,
      routingItem?.config,
    )
  })
}

export async function runPipeline(
  swapParams: SwapParams,
): Promise<SwapApiResponse> {
  const pipeline = loadPipeline(swapParams)

  const allResults: StrategyResult[] = []
  for (let i = 0; i < pipeline.length; i++) {
    const result = await pipeline[i].findSwap(swapParams)
    allResults.push(result)
    if (result.response) break
  }

  // console.log(allResults)

  const finalResult = allResults.pop()
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

  return finalResult.response
}

// TODO timeouts on balmy
// TODO review and add sources
// TODO tokenlist, interfaces
// TODO price impact
// TODO logging
// TODO pendle rollover
