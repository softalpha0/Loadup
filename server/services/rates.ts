// BTC/USD rate, only used when the provider reports no USD price for an invoice
// (needed to enforce spending limits). Cached for 5 minutes.
let cache: { at: number; usd: number } | null = null

const SOURCES: { url: string; read: (j: any) => number }[] = [
  { url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot', read: (j) => Number(j?.data?.amount) },
  { url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD', read: (j) => Number(Object.values<any>(j?.result ?? {})[0]?.c?.[0]) },
  { url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', read: (j) => Number(j?.bitcoin?.usd) },
]

export async function btcUsd(fetchFn: typeof fetch = fetch): Promise<number | null> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.usd
  for (const s of SOURCES) {
    try {
      const res = await fetchFn(s.url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const v = s.read(await res.json())
      if (Number.isFinite(v) && v > 1000) {
        cache = { at: Date.now(), usd: v }
        return v
      }
    } catch { /* try next */ }
  }
  return cache?.usd ?? null
}

export function satsToUsd(sats: number, rate: number): number {
  return (sats / 1e8) * rate
}
