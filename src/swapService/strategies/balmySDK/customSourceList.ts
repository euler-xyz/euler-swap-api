import type { IFetchService, IProviderService } from "@balmy/sdk"
import { LocalSourceList } from "@balmy/sdk/dist/services/quotes/source-lists/local-source-list"
import { CustomLiFiQuoteSource } from "./lifiQuoteSource"
import { CustomOneInchQuoteSource } from "./oneInchQuoteSource"
import { CustomPendleQuoteSource } from "./pendleQuoteSource"
type ConstructorParameters = {
  providerService: IProviderService
  fetchService: IFetchService
}

const customSources = {
  "1inch": new CustomOneInchQuoteSource(),
  "li-fi": new CustomLiFiQuoteSource(),
  pendle: new CustomPendleQuoteSource(),
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
