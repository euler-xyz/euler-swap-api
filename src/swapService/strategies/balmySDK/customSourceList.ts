import type { IFetchService, IProviderService } from "@balmy/sdk"
import { LocalSourceList } from "@balmy/sdk/dist/services/quotes/source-lists/local-source-list"
import { CustomLiFiQuoteSource } from "./lifiQuoteSource"
import { CustomNeptuneQuoteSource } from "./neptuneQuoteSource"
import { CustomOdosQuoteSource } from "./odosQuoteSource"
import { CustomOkuQuoteSource } from "./okuQuoteSource"
import { CustomOneInchQuoteSource } from "./oneInchQuoteSource"
import { CustomOogaboogaQuoteSource } from "./oogaboogaQuoteSource"
import { CustomOpenOceanQuoteSource } from "./openOceanQuoteSource"
import { CustomPendleQuoteSource } from "./pendleQuoteSource"
import { CustomUniswapQuoteSource } from "./uniswapQuoteSource"

type ConstructorParameters = {
  providerService: IProviderService
  fetchService: IFetchService
}

const customSources = {
  "1inch": new CustomOneInchQuoteSource(),
  "li-fi": new CustomLiFiQuoteSource(),
  pendle: new CustomPendleQuoteSource(),
  "open-ocean": new CustomOpenOceanQuoteSource(),
  neptune: new CustomNeptuneQuoteSource(),
  odos: new CustomOdosQuoteSource(),
  oogabooga: new CustomOogaboogaQuoteSource(),
  uniswap: new CustomUniswapQuoteSource(),
  oku_bob_icecreamswap: new CustomOkuQuoteSource(
    "icecreamswap",
    "IceCreamSwap",
    [60808],
  ),
  // oku_bob_uniswap: new CustomOkuQuoteSource("usor", "Uniswap", [60808]),
}
export class CustomSourceList extends LocalSourceList {
  constructor({ providerService, fetchService }: ConstructorParameters) {
    super({ providerService, fetchService })

    const mutableThis = this as any
    mutableThis.sources = {
      ...mutableThis.sources,
      ...customSources,
    }
    delete mutableThis.sources.balmy
  }
}
