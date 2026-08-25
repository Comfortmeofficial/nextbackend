// Matches Python's f"{amount:,.2f}" — comma-grouped, 2 decimal places.
export function formatNaira(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Explicit Africa/Lagos rather than relying on the server's own timezone
// (Vercel's Node runtime is UTC) — this app is Lagos-area only throughout
// (see ride-schedules.ts's own fixed WAT offset), so departure times in a
// rider-facing email must render in WAT regardless of where the function runs.
export function formatRideDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
