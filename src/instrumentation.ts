// Next.js calls this once when the server process starts:
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// All of our DB pools (src/modules/*/db.ts) connect to hosts that publish
// both A and AAAA records (Neon, etc). Node 18+'s DNS resolution races
// IPv4/IPv6 addresses (Happy Eyeballs) and throws an AggregateError if every
// attempt fails — which is exactly what happens when a network's IPv6 route
// is advertised but doesn't actually work (common on home/corporate
// networks). Forcing IPv4-first here fixes it process-wide instead of
// per-pool.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
  }
}
