import * as ReactQuery from "@tanstack/react-query"
import { AxiosError } from "axios"
import { FlightWithFares, ScraperResponse, SearchQuery, AWFR24Response } from "../types/scrapers.js"
import React from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { UseQueryOptions } from "@tanstack/react-query"
import { runScraper } from "../helpers/runScraper.js"
import { scrapersByAirlineRoutes, ScraperToRun, DatedRoute, AirlineRoute, expandOriginsDestinations, fr24ResponseToAirlineRoutes, flightsFromScraperResponses } from "./awardSearch.js"

export type UseQueryMeta = { scraperToRun: ScraperToRun }

export type ScraperError = { name: "ScraperError", message: string, logLines: string[] }

export type AwardSearchProgress = {
  datedRoutes: DatedRoute[],                     // [{origin, destination, departureDate}]
  airlineRoutes: AirlineRoute[],                 // [{origin, destination, airlineCode, airlineName}]
  scrapersToRun: ScraperToRun[],                 // [{scraper, forAirlines[], forDatedRoute}]
  scraperResponses: ScraperResponse[],           // [{forKey, flightsWithFares={origin, dest, ...}}, errored, ...}]

  searchResults: FlightWithFares[],
  loadingQueriesKeys: ReactQuery.QueryKey[],
  errors: { queryKey: ReactQuery.QueryKey, error: Error }[]

  stop: () => Promise<void>
}

export const queryKeyForAirlineRoute = (datedRoute: DatedRoute): ReactQuery.QueryKey => [`airlineRoutes-${datedRoute.origin}-${datedRoute.destination}`]
export const queryKeyForScraperResponse = (scraperToRun: ScraperToRun): ReactQuery.QueryKey => [`awardAvailability-${scraperToRun.scraperName}-${scraperToRun.forDatedRoute.origin}-${scraperToRun.forDatedRoute.destination}-${scraperToRun.forDatedRoute.departureDate}`]
export const queryKeysEqual = (a: ReactQuery.QueryKey, b: ReactQuery.QueryKey): boolean => ReactQuery.hashQueryKey(a) === ReactQuery.hashQueryKey(b)

export const useAwardSearch = (searchQuery: SearchQuery): AwardSearchProgress => {
  const queryClient = useQueryClient()
  const [stoppedQueries, setStoppedQueries] = React.useState<ReactQuery.QueryKey[]>([])

  // Take all origins and destinations and create a list of all possible pairs: [{origin, destination, departureDate}]
  const datedRoutes = React.useMemo(() => {
    setStoppedQueries([])
    return expandOriginsDestinations(searchQuery)
  }, [searchQuery])

  // Returns the airlines flying a route: [{origin, destination, airlineCode, airlineName}]
  const airlineRouteQueriesOpts = datedRoutes.map((datedRoute): UseQueryOptions<AirlineRoute[], Error> => ({
    queryKey: queryKeyForAirlineRoute(datedRoute),
    queryFn: fetchAirlineRoutes,
    meta: datedRoute,
    staleTime: 1000 * 60 * 60 * 24 * 30,
    cacheTime: 1000 * 60 * 60 * 24 * 30,
    retry: 3,
    enabled: !stoppedQueries.some((stoppedQuery) => queryKeysEqual(stoppedQuery, queryKeyForAirlineRoute(datedRoute)))
  }))
  const airlineRouteQueries = ReactQuery.useQueries({ queries: airlineRouteQueriesOpts })
  const keyedAirlineRouteQueries = airlineRouteQueries.map((query, index) => ({ ...query, queryKey: airlineRouteQueriesOpts[index]!.queryKey! }))

  // Returns the list of scraper-airline-route-date that'll be necessary to run: [{scraper, matchedAirlines[]}]
  const { scrapersToRun, airlineRoutes } = React.useMemo(() => {
    const stableAirlineRoutes = airlineRouteQueries.flatMap((query) => query.data).filter((item): item is AirlineRoute => !!item)
    const scrapersToRun = scrapersByAirlineRoutes(stableAirlineRoutes, searchQuery.departureDate)

    return { scrapersToRun, airlineRoutes: stableAirlineRoutes }
  }, [airlineRouteQueries, searchQuery.departureDate])

  // Returns the scraper results from all scrapers: [{ flightsWithFares: { flightNo, origin, amenities, ... }, errored, ]
  const scraperQueriesOpts = scrapersToRun.map((scraperToRun): UseQueryOptions<ScraperResponse, Error> => ({
    queryKey: queryKeyForScraperResponse(scraperToRun),
    staleTime: 1000 * 60 * 15,
    cacheTime: 1000 * 60 * 15,
    queryFn: fetchAwardAvailability,
    meta: { scraperToRun } as UseQueryMeta,
    refetchOnWindowFocus: () => !queryClient.getQueryState<ScraperResponse, { message: string, log: string[]}>(queryKeyForScraperResponse(scraperToRun))?.error,  // dont refresh if it was an error
    enabled: !stoppedQueries.some((check) => queryKeysEqual(check, queryKeyForScraperResponse(scraperToRun)))
  }))
  const scraperQueries = ReactQuery.useQueries({ queries: scraperQueriesOpts })
  const keyedScraperQueries = scraperQueries.map((query, index) => ({ ...query, queryKey: scraperQueriesOpts[index]!.queryKey! }))

  // Take the results and do final calculations (like merging like flights' details and merging amenities/fares)
  const { flights, scraperResponses } = React.useMemo(() => {
    const scraperResponses = scraperQueries.flatMap((query) => query.data).filter((item): item is ScraperResponse => !!item)
    return { flights: flightsFromScraperResponses(scraperResponses), scraperResponses }
  }, [scraperQueries])

  const loadingQueriesKeys = [keyedAirlineRouteQueries, keyedScraperQueries].flat().filter((item) => item.isFetching).map((item) => item.queryKey)
  const errorsQueries = [keyedAirlineRouteQueries, keyedScraperQueries].flat().filter((item) => item.error ?? stoppedQueries.some((check) => queryKeysEqual(check, item.queryKey)))
  const errors = errorsQueries.map((query) => ({ queryKey: query.queryKey, error: (query.error as Error | undefined) ?? new Error("stopped") }))

  const stop = async () => {
    setStoppedQueries([...loadingQueriesKeys])
    await Promise.all(loadingQueriesKeys.map(async (queryKey) => queryClient.cancelQueries(queryKey)))
  }

  return { searchResults: flights, datedRoutes, airlineRoutes, scrapersToRun, scraperResponses, loadingQueriesKeys, errors, stop }
}

//////////////////////

const fetchAirlineRoutes = async ({ signal, meta }: ReactQuery.QueryFunctionContext): Promise<AirlineRoute[]> => {
  const datedRoute = meta as DatedRoute

  const request = await runScraper<AWFR24Response>("fr24", datedRoute, signal)
  return fr24ResponseToAirlineRoutes(request.data)
}

const fetchAwardAvailability = async ({ signal, meta: metaRaw, queryKey }: ReactQuery.QueryFunctionContext): Promise<ScraperResponse> => {
  const meta = metaRaw as UseQueryMeta
  const scraperToRun = meta.scraperToRun

  const response = await runScraper(scraperToRun.scraperName, scraperToRun.forDatedRoute, signal).catch((error: AxiosError<ScraperResponse>) => {
    // TODO: throw proper errors
    if (error.response?.data)
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw { logLines: error.response.data.logLines, message: "Internal scraper error", name: "ScraperError" } as ScraperError
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw { logLines: [ "*** Network error calling scraper ***", error.message ], message: "Network error calling scraper", name: "ScraperError" } as ScraperError
  })
  response.data.forKey = queryKey
  return response.data
}
