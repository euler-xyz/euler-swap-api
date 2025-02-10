import { base, mainnet } from "viem/chains"
import type { RoutingConfig } from "../interface"
import baseRoutingConfig from "./base"
import beraRoutingConfig from "./bera"
import defaultRoutingConfig from "./default"
import mainnetRoutingConfig from "./mainnet"
import swellRoutingConfig from "./swell"

const routingConfig: RoutingConfig = {
  [mainnet.id]: mainnetRoutingConfig,
  [base.id]: baseRoutingConfig,
  [1923]: swellRoutingConfig,
  [80094]: beraRoutingConfig,
}

export const getRoutingConfig = (chainId: number) => {
  return routingConfig[chainId] || defaultRoutingConfig
}
