import type { IFetchService, IProviderService } from "@balmy/sdk"
import { LocalSourceList } from "@balmy/sdk/dist/services/quotes/source-lists/local-source-list"
import { CustomLiFiQuoteSource } from "./lifiQuoteSource"
import { CustomNeptuneQuoteSource } from "./neptuneQuoteSource"
import { CustomOdosQuoteSource } from "./odosQuoteSource"
import { CustomOneInchQuoteSource } from "./oneInchQuoteSource"
import { CustomOpenOceanQuoteSource } from "./openOceanQuoteSource"
import { CustomPendleQuoteSource } from "./pendleQuoteSource"

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
