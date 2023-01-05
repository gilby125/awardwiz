import { ScraperPool } from "./scraper-pool.js"
import { AwardWizScraperModule, AwardWizQuery } from "./types.js"
import c from "ansi-colors"
import { logGlobal } from "./log.js"

const pool = new ScraperPool({
  showBrowserDebug: true,
  showUncached: true,
  useProxy: true,
  showBlocked: true,
  showFullRequest: [],
  showFullResponse: [],
  pauseAfterRun: true,
  pauseAfterError: true,
  changeProxies: true,
  maxAttempts: 1,
  minBrowserPool: 1,
  maxBrowserPool: 1,
})

for (let i: number = 0; i < 1; i += 1) {
  const scraper: AwardWizScraperModule = await import("./scrapers/southwest.js")
  const randomDate = "2023-01-23" // dayjs().add(Math.floor(Math.random() * 180), "day").format("YYYY-MM-DD")
  const flights = [["SJC", "HNL"]] //[["SFO", "LAX"], ["LAX", "SFO"], ["SAN", "SJC"], ["SJC", "SAN"], ["OAK", "HNL"]]
  const flight = flights[Math.floor(Math.random() * flights.length)]
  const query: AwardWizQuery = { origin: flight[0], destination: flight[1], departureDate: randomDate }

  await pool.runScraper(async (sc) => {
    sc.log("Using query:", query)
    const scraperResults = await scraper.runScraper(sc, query)
    sc.log(c.green(`Completed with ${scraperResults.length} results`))
    return scraperResults
  }, scraper.meta, `${query.origin}-${query.destination}-${query.departureDate}`)
}

logGlobal("Ending")
await pool.drainAll()
logGlobal("Ended")

// await runScraper(async (sc) => {
// }, { name: "test", noBlocking: true, noProxy: false }, { showUncached: true })
