import { ensureBookingSchema, getBookingPool } from "../db";

// Mirrors wallet/repository.ts's getAnalytics bucketing exactly, but reads
// actual bookings instead of wallet transactions — that endpoint only ever
// saw wallet funding/wallet-paid fares, so a booking paid by card or bank
// transfer (most of them) never counted toward revenue at all. This is the
// single source of truth for "how much did we actually make."
type AnalyticsGranularity = "hour" | "day" | "month";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthStart(date: Date, monthsAgo = 0): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() - monthsAgo;
  return new Date(Date.UTC(Math.floor(total / 12), ((total % 12) + 12) % 12, 1));
}

function bucketKey(date: Date, granularity: AnalyticsGranularity): string {
  if (granularity === "hour") return date.toISOString().slice(0, 13);
  if (granularity === "day") return date.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 7);
}

function bucketLabel(date: Date, range: string, granularity: AnalyticsGranularity): string {
  if (granularity === "hour") return `${date.getUTCHours()}:00`;
  if (granularity === "day") {
    return range === "week" ? WEEKDAY_LABELS[date.getUTCDay()] : String(date.getUTCDate());
  }
  return range === "all"
    ? `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
    : MONTH_LABELS[date.getUTCMonth()];
}

// Expected buckets are generated up front and zero-filled below — the raw
// query only returns rows for buckets that actually had a booking, which on
// a quiet period produces a sparse, misleading-looking timeline instead of
// a complete one.
function bucketRange(since: Date, until: Date, granularity: AnalyticsGranularity): Date[] {
  const buckets: Date[] = [];
  const cur = new Date(since);
  if (granularity === "hour") {
    while (cur.getTime() <= until.getTime()) {
      buckets.push(new Date(cur));
      cur.setUTCHours(cur.getUTCHours() + 1);
    }
  } else if (granularity === "day") {
    while (bucketKey(cur, "day") <= bucketKey(until, "day")) {
      buckets.push(new Date(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  } else {
    while (bucketKey(cur, "month") <= bucketKey(until, "month")) {
      buckets.push(new Date(cur));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }
  return buckets;
}

export interface RevenueAnalyticsPoint {
  label: string;
  revenue: number;
  bookings: number;
}

// Only 'confirmed'/'completed' bookings count as revenue — this codebase
// only ever creates a booking row once payment has already succeeded (see
// insertBookingRow), so in practice this is "every booking that wasn't
// later cancelled or refunded."
export async function getRevenueAnalytics(range: string): Promise<RevenueAnalyticsPoint[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let granularity: AnalyticsGranularity;
  let since: Date;

  if (range === "today") {
    granularity = "hour";
    since = todayStart;
  } else if (range === "week") {
    granularity = "day";
    since = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  } else if (range === "year") {
    granularity = "month";
    since = monthStart(todayStart, 11);
  } else if (range === "all") {
    granularity = "month";
    const { rows } = await pool.query<{ earliest: Date | null }>(
      `SELECT MIN(created_at) AS earliest FROM bookings
       WHERE deleted_at IS NULL AND status IN ('confirmed', 'completed')`,
    );
    if (!rows[0]?.earliest) return [];
    since = monthStart(new Date(rows[0].earliest));
  } else {
    granularity = "day";
    since = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
  }

  const { rows } = await pool.query<{ created_at: Date; final_amount: number }>(
    `SELECT created_at, final_amount FROM bookings
     WHERE created_at >= $1
       AND deleted_at IS NULL
       AND status IN ('confirmed', 'completed')`,
    [since],
  );

  const aggregated = new Map<string, { revenue: number; bookings: number }>();
  for (const row of rows) {
    const key = bucketKey(new Date(row.created_at), granularity);
    const entry = aggregated.get(key) ?? { revenue: 0, bookings: 0 };
    entry.revenue += row.final_amount || 0;
    entry.bookings += 1;
    aggregated.set(key, entry);
  }

  return bucketRange(since, now, granularity).map((date) => {
    const entry = aggregated.get(bucketKey(date, granularity));
    return {
      label: bucketLabel(date, range, granularity),
      revenue: entry?.revenue ?? 0,
      bookings: entry?.bookings ?? 0,
    };
  });
}
