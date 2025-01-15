import type { Handler, NextFunction, Request, Response } from "express"
import { StatusCodes } from "http-status-codes"
import { EXAMPLE_API_KEY } from "../constants"
import { ServiceResponse } from "../models/serviceResponse"
import { handleServiceResponse } from "../utils/httpHandlers"

const apiKeysFromEnv = (regExp: RegExp): string[] =>
  Object.keys(process.env)
    .filter((key) => regExp.test(key))
    .map((key) => process.env[key] as string)

export const apiKeyAuth: Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const apiKeys = apiKeysFromEnv(/^API_KEY_/)
  apiKeys.push(EXAMPLE_API_KEY)

  const apiKey = req.header("x-api-key")
  if (!apiKey || !apiKeys.includes(apiKey)) {
    const serviceResponse = ServiceResponse.failure(
      "Unauthorized",
      StatusCodes.UNAUTHORIZED,
      { ip: req.ip },
    )
    handleServiceResponse(serviceResponse, req, res)
  }
  next()
}
