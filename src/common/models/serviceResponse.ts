import { StatusCodes } from "http-status-codes"
import { z } from "zod"

export class ServiceResponse<T = null> {
  readonly success: boolean
  readonly message?: string
  readonly data: T
  readonly statusCode: number

  private constructor(
    success: boolean,
    data: T,
    statusCode: number,
    message?: string,
  ) {
    this.success = success
    this.message = message
    this.data = data
    this.statusCode = statusCode
  }

  static success<T>(data: T, statusCode: number = StatusCodes.OK) {
    return new ServiceResponse(true, data, statusCode)
  }

  static failure(
    message: string,
    statusCode: number = StatusCodes.BAD_REQUEST,
    data?: any,
  ) {
    return new ServiceResponse(false, data, statusCode, message)
  }
}

export const ServiceResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    message: z.string().optional(),
    data: dataSchema.optional(),
    statusCode: z.number(),
  })
