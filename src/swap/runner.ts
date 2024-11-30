import routingConfig from "./config"
import type {
  ChainRoutingConfig,
  RoutingItem,
  SwapApiResponse,
} from "./interface"
import { strategies } from "./strategies/index"
import type { StrategyResult, SwapParams } from "./types"

// TODO cache
function loadPipeline(swapParams: SwapParams) {
  let routing: ChainRoutingConfig
  if (swapParams.routingOverride) {
    routing = swapParams.routingOverride
  } else {
    routing = routingConfig[String(swapParams.chainId)]
    if (!routing) throw new Error("Routing config not found for chainId")
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

  console.log(allResults)

  const finalResult = allResults.pop()
  if (!finalResult) throw new Error("Pipeline empty or result not found")
  if (!finalResult.response) {
    throw new Error("Swap quote not found") // TODO 404
  }

  return finalResult.response
}

// TODO error handling
// TODO npm interfaces
