import dotenv from "dotenv"
dotenv.config()

import {
  http,
  type Chain,
  type Client,
  type Transport,
  createClient,
  defineChain,
} from "viem"
import * as chains from "viem/chains"

export const bartio = defineChain({
  id: 8008_4,
  name: "Bartio Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Bera",
    symbol: "BERA",
  },
  blockExplorers: {
    default: {
      name: "Bartio",
      url: "https://bartio.beratrail.io/",
    },
  },
  rpcUrls: {
    default: {
      http: ["https://bartio.rpc.berachain.com/"],
    },
  },
})

export const RPC_URLS: Record<number, string> = {
  [chains.mainnet.id]: process.env.RPC_URL_1 || "",
  [chains.sepolia.id]: process.env.RPC_URL_11155111 || "",
  [chains.arbitrum.id]: process.env.RPC_URL_42161 || "",
  [chains.base.id]: process.env.RPC_URL_8453 || "",
  [bartio.id]: process.env.RPC_URL_80084 || "",
  [80094]: process.env.RPC_URL_80094 || "",
  [chains.foundry.id]: process.env.RPC_URL_31337 || "http://localhost:8545",
} as const

export const createHttp = (chainId: number) =>
  http(RPC_URLS[chainId], {
    timeout: 120_000,
    // fetchOptions: { cache: "no-store" },
  })

export function createChainConfig(chain: Chain) {
  return createClient({
    chain,
    transport: createHttp(chain.id),
  })
}

export const createClients = (): Record<number, Client<Transport, Chain>> => ({
  [bartio.id]: createChainConfig(bartio),
  [chains.mainnet.id]: createChainConfig(chains.mainnet),
  [chains.sepolia.id]: createClient({
    chain: chains.sepolia,
    transport: http(RPC_URLS[chains.sepolia.id]),
  }),
  [chains.foundry.id]: createClient({
    chain: chains.foundry,
    transport: http(RPC_URLS[chains.foundry.id]),
  }),
  [chains.arbitrum.id]: createChainConfig(chains.arbitrum),
})

export const viemClients = createClients()
