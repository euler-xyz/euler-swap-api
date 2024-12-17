import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi"
import express, { type Router, type Request, type Response } from "express"

import { createApiResponse } from "@/api-docs/openAPIResponseBuilders"

import { ServiceResponse } from "@/common/models/serviceResponse"
import {
  handleServiceResponse,
  validateRequest,
} from "@/common/utils/httpHandlers"
import { runPipeline } from "@/swapService/runner"
import type { SwapParams } from "@/swapService/types"
import {
  ApiError,
  addInOutDeposits,
  findToken,
  getSwapper,
} from "@/swapService/utils"
import { StatusCodes } from "http-status-codes"
import { InvalidAddressError, isHex } from "viem"
import { z } from "zod"
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
    console.log("===== END =====")
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
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Verifier transaction is empty",
      )

    return ServiceResponse.success<SwapResponse>(data)
  } catch (error) {
    console.log("error: ", error)
    if (error instanceof ApiError) {
      return ServiceResponse.failure(
        error.message,
        error.statusCode,
        error.data,
      )
    }
    return ServiceResponse.failure(
      `${error}`,
      StatusCodes.INTERNAL_SERVER_ERROR,
    )
  }
}

function parseRequest(request: Request): SwapParams {
  try {
    const { query: validatedParams } = getSwapSchema.parse(request)

    // TODO
    // if (!isSupportedChainId(validatedParams.chainId)) {
    //   throw new Error("Unsupported chainId")
    // }

    const chainId = validatedParams.chainId
    const tokenIn = findToken(chainId, validatedParams.tokenIn)
    if (!tokenIn)
      throw new ApiError(StatusCodes.NOT_FOUND, "Token in not supported")

    const tokenOut = findToken(chainId, validatedParams.tokenOut)
    if (!tokenOut)
      throw new ApiError(StatusCodes.NOT_FOUND, "Token out not supported")

    return {
      ...validatedParams,
      from: getSwapper(chainId),
      chainId,
      tokenIn,
      tokenOut,
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof z.ZodError) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`,
      )
    }
    if (error instanceof InvalidAddressError)
      throw new ApiError(400, "Invalid Address")

    throw new ApiError(500, `${error}`)
  }
}
