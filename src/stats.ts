import { Scraper } from "./scraper.js"
import { Request } from "playwright"

export class Stats {
  sc?: Scraper
  domains: Record<string, number> = {}

  totCacheHits = 0
  totCacheMisses = 0
  totBlocked = 0
  totDomains = 0
  bytesDownloaded = 0

  constructor(sc: Scraper) {
    this.sc = sc
    this.sc.context!.on("requestfinished", this.onRequestFinished.bind(this))
    this.sc.context!.on("requestfailed", this.onRequestFailed.bind(this))
  }

  private async onRequestFinished(req: Request) {
    const response = await req.response()
    if (response?.headers()["x-fromcache"]) {
      this.totCacheHits += 1
    } else {
      this.totCacheMisses += 1

      const hostname = new URL(req.url()).hostname
      const sizes = await req.sizes().catch(() => ({ responseBodySize: 0, responseHeadersSize: 0 }))
      const bytes = sizes.responseBodySize + sizes.responseHeadersSize

      this.domains[hostname] = (this.domains[hostname] || 0) + bytes
      this.totDomains = Object.keys(this.domains).length
      this.bytesDownloaded += bytes
    }
  }

  private async onRequestFailed(req: Request) {
    if (["NS_ERROR_FAILURE", "net::ERR_FAILED", "Blocked by Web Inspector"].includes(req.failure()?.errorText ?? ""))
      this.totBlocked += 1
  }

  toString() {
    return `${this.totCacheHits} cache hits · ${this.totCacheMisses} cache misses · ${this.totBlocked} blocked · ${this.totDomains} domains · ${this.bytesDownloaded.toLocaleString("en-US")} bytes`
  }
}
