import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi"
import express, { type Router, type Request, type Response } from "express"

import { createApiResponse } from "@/api-docs/openAPIResponseBuilders"

import { ServiceResponse } from "@/common/models/serviceResponse"
import {
  handleServiceResponse,
  validateRequest,
} from "@/common/utils/httpHandlers"
import { runPipeline } from "@/swap/runner"
import type { SwapParams } from "@/swap/types"
import { addInOutDeposits, findToken, getSwapper } from "@/swap/utils"
import { StatusCodes } from "http-status-codes"
import { isHex } from "viem"
import {
  type SwapResponse,
  getSwapSchema,
  swapResponseSchema,
} from "./swapModel"

export const swapRegistry = new OpenAPIRegistry()
export const swapRouter: Router = express.Router()

swapRegistry.register("Swap", swapResponseSchema)
swapRegistry.registerPath({
  method: "get",
  path: "/swap",
  tags: ["Swap"],
  request: { query: getSwapSchema.shape.query },
  responses: createApiResponse(swapResponseSchema, "Success"),
})

swapRouter.get(
  "/",
  validateRequest(getSwapSchema),
  async (req: Request, res: Response) => {
    const serviceResponse = await findSwap(req)
    return handleServiceResponse(serviceResponse, res)
  },
)

async function findSwap(
  req: Request,
): Promise<ServiceResponse<SwapResponse | null>> {
  try {
    const swapParams = parseRequest(req)

    let data = await runPipeline(swapParams)

    // GLOBAL CHECKS
    data = addInOutDeposits(swapParams, data)

    // make sure verify item includes at least a function selector
    if (
      !isHex(data.verify.verifierData) ||
      data.verify.verifierData.length < 10
    )
      throw new Error("Verifier transaction is empty")

    return ServiceResponse.success<SwapResponse>(data)
  } catch (_error) {
    return ServiceResponse.failure(
      "Quote not found",
      null,
      StatusCodes.NOT_FOUND,
    )
  }
}

function parseRequest(request: Request): SwapParams {
  const { query: validatedParams } = getSwapSchema.parse(request)

  // TODO
  // if (!isSupportedChainId(validatedParams.chainId)) {
  //   throw new Error("Unsupported chainId")
  // }

  const chainId = validatedParams.chainId
  const tokenIn = findToken(chainId, validatedParams.tokenIn)
  if (!tokenIn) throw new Error("Token in not supported")

  const tokenOut = findToken(chainId, validatedParams.tokenOut)
  if (!tokenOut) throw new Error("Token out not supported")

  return {
    ...validatedParams,
    from: getSwapper(chainId),
    chainId,
    tokenIn,
    tokenOut,
  }
}
