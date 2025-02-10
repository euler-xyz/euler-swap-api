import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi"
import express, { type Router, type Request, type Response } from "express"

import { createApiResponse } from "@/api-docs/openAPIResponseBuilders"

import { ServiceResponse } from "@/common/models/serviceResponse"
import {
  handleServiceResponse,
  validateRequest,
} from "@/common/utils/httpHandlers"
import { findSwaps } from "@/swapService/runner"
import type { SwapParams } from "@/swapService/types"
import { ApiError, findToken, getSwapper } from "@/swapService/utils"
import { StatusCodes } from "http-status-codes"
import { InvalidAddressError } from "viem"
import { z } from "zod"
import {
  type SwapResponse,
  type SwapResponseSingle,
  getSwapSchema,
  swapResponseSchema,
  swapResponseSchemaSingle,
} from "./swapModel"

export const swapRegistry = new OpenAPIRegistry()
export const swapRouter: Router = express.Router()

swapRegistry.register("SwapQuote", swapResponseSchemaSingle)
swapRegistry.registerPath({
  method: "get",
  path: "/swap",
  tags: ["Get the best swap quote"],
  request: { query: getSwapSchema.shape.query },
  responses: createApiResponse(swapResponseSchemaSingle, "Success"),
})

swapRegistry.register("SwapQuotes", swapResponseSchema)
swapRegistry.registerPath({
  method: "get",
  path: "/swaps",
  tags: ["Get swap quotes ordered from best to worst"],
  request: { query: getSwapSchema.shape.query },
  responses: createApiResponse(swapResponseSchema, "Success"),
})

swapRouter.get(
  "/swap",
  validateRequest(getSwapSchema),
  async (req: Request, res: Response) => {
    try {
      const swaps = await findSwaps(parseRequest(req))
      return handleServiceResponse(
        ServiceResponse.success<SwapResponseSingle>(swaps[0]),
        res,
      )
    } catch (error) {
      return handleServiceResponse(createFailureResponse(req, error), res)
    } finally {
      console.log("===== END =====")
    }
  },
)

swapRouter.get(
  "/swaps",
  validateRequest(getSwapSchema),
  async (req: Request, res: Response) => {
    try {
      const swaps = await findSwaps(parseRequest(req))
      return handleServiceResponse(
        ServiceResponse.success<SwapResponse>(swaps),
        res,
      )
    } catch (error) {
      return handleServiceResponse(createFailureResponse(req, error), res)
    } finally {
      console.log("===== END =====")
    }
  },
)

function createFailureResponse(req: Request, error: any) {
  console.log(
    "error: ",
    error.statusCode,
    error.message,
    error.errorMessage,
    JSON.stringify(error.data),
    req.url,
  )
  if (error instanceof ApiError) {
    return ServiceResponse.failure(error.message, error.statusCode, error.data)
  }
  return ServiceResponse.failure(`${error}`, StatusCodes.INTERNAL_SERVER_ERROR)
}

function parseRequest(request: Request): SwapParams {
  try {
    const { query: validatedParams } = getSwapSchema.parse(request)

    // TODO
    // if (!isSupportedChainId(validatedParams.chainId)) {
    //   throw new Error("Unsupported chainId")
    //  }

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
