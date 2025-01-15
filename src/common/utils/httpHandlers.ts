import type { NextFunction, Request, RequestHandler, Response } from "express"
import { StatusCodes } from "http-status-codes"
import type { ZodError, ZodSchema } from "zod"

import { ServiceResponse } from "@/common/models/serviceResponse"

export const handleServiceResponse = (
  serviceResponse: ServiceResponse<any>,
  request: Request,
  response: Response,
) => {
  if (serviceResponse.statusCode !== StatusCodes.OK) {
    console.log(
      "error: ",
      serviceResponse.statusCode,
      serviceResponse.message,
      JSON.stringify(serviceResponse.data),
      request.url,
    )
  }
  console.log(serviceResponse)
  response.status(serviceResponse.statusCode).send(serviceResponse)
}

export const validateRequest =
  (schema: ZodSchema): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
        headers: req.headers,
      })
      next()
    } catch (err) {
      const errorMessage = `Invalid input: ${(err as ZodError).errors.map((e) => e.message).join(", ")}`
      const statusCode = StatusCodes.BAD_REQUEST
      const serviceResponse = ServiceResponse.failure(errorMessage, statusCode)
      return handleServiceResponse(serviceResponse, req, res)
    }
  }
