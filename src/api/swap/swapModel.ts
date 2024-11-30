import { SwapVerificationType, SwapperMode } from "@/swap/interface"
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi"
import { InvalidAddressError, getAddress, isHex } from "viem"
import { z } from "zod"

extendZodWithOpenApi(z)

export type Meta = z.infer<typeof metaSchema>
export type SwapResponse = z.infer<typeof swapResponseSchema>

const addressSchema = z
  .string()
  .min(1)
  .transform((address, ctx) => {
    try {
      return getAddress(address)
    } catch (error) {
      if (error instanceof InvalidAddressError) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid Ethereum address: ${address}`,
        })
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unexpected error validating address: ${error}`,
        })
      }
      return z.NEVER
    }
  })

const hexSchema = z
  .string()
  .min(1)
  .transform((hex, ctx) => {
    if (!isHex(hex)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid hex value: ${hex}`,
      })
      return z.NEVER
    }
    return hex
  })

// Define the Meta type using Zod
const metaSchema = z
  .object({
    isPendlePT: z.boolean().optional(),
    pendleMarket: addressSchema.optional(),
    poolId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.isPendlePT && !data.pendleMarket) {
        return false
      }
      return true
    },
    {
      message: "pendleMarket is required when isPendlePT is true",
      path: ["pendleMarket"],
    },
  )

const swapperModeSchema = z.nativeEnum(SwapperMode)

const swapRouteItemSchema = z.object({
  providerName: z.string(),
})

const swapVerificationTypeSchema = z.nativeEnum(SwapVerificationType)

const strategyConfigSchema = z.any()

const tokenListItemSchema = z.any()

const swapApiResponseVerifySchema = z.object({
  verifierAddress: addressSchema,
  verifierData: hexSchema,
  type: swapVerificationTypeSchema,
  vault: addressSchema,
  account: addressSchema,
  amount: z.string(),
  deadline: z.number(),
})

const swapApiResponseMulticallItemSchema = z.object({
  functionName: z.string(),
  args: z.any(),
  data: hexSchema,
})

const strategyMatchConfigSchema = z.object({
  swapperModes: z.array(swapperModeSchema).optional(),
  isRepay: z.boolean().optional(),
  isPendlePT: z.boolean().optional(),
  tokensInOrOut: z.array(addressSchema).optional(),
})

const routingItemSchema = z.object({
  strategy: z.string(),
  match: strategyMatchConfigSchema,
  config: strategyConfigSchema.optional(),
})

const chainRoutingConfigSchema = z.array(routingItemSchema)

const swapApiResponseSwapSchema = z.object({
  swapperAddress: addressSchema,
  swapperData: hexSchema,
  multicallItems: z.array(swapApiResponseMulticallItemSchema),
})

const getSwapSchema = z.object({
  query: z.object({
    chainId: z.string().transform(Number).pipe(z.number().int().positive()),
    tokenIn: addressSchema,
    tokenOut: addressSchema,
    receiver: addressSchema,
    vaultIn: addressSchema,
    origin: addressSchema,
    accountIn: addressSchema,
    accountOut: addressSchema,
    amount: z
      .string()
      .transform((s) => BigInt(s || "0"))
      .pipe(z.bigint()),
    targetDebt: z
      .string()
      .transform((s) => BigInt(s || "0"))
      .pipe(z.bigint()),
    currentDebt: z
      .string()
      .transform((s) => BigInt(s || "0"))
      .pipe(z.bigint()),
    swapperMode: z.string().transform(Number).pipe(z.nativeEnum(SwapperMode)),
    slippage: z
      .string()
      .transform(Number)
      .pipe(z.number().nonnegative().max(50)),
    deadline: z.string().transform(Number).pipe(z.number().int().nonnegative()),
    isRepay: z
      .string()
      .toLowerCase()
      .transform((s) => JSON.parse(s))
      .pipe(z.boolean()),
    routingOverride: z
      .string()
      .transform((s) => JSON.parse(s))
      .pipe(chainRoutingConfigSchema)
      .optional(), // TODO handle routing config
  }),
})

const swapResponseSchema = z.object({
  amountIn: z.string(),
  amountInMax: z.string(),
  amountOut: z.string(),
  amountOutMin: z.string(),
  accountIn: addressSchema,
  accountOut: addressSchema,
  vaultIn: addressSchema,
  receiver: addressSchema,
  tokenIn: tokenListItemSchema,
  tokenOut: tokenListItemSchema,
  slippage: z.number(),
  swap: swapApiResponseSwapSchema,
  verify: swapApiResponseVerifySchema,
  route: z.array(swapRouteItemSchema),
})

export { getSwapSchema, swapResponseSchema }
