import { NextRequest, NextResponse } from "next/server";

// Mirrors the `cors` plugin config that was applied identically to every
// route in infrastructure/apisix-resources/routes/*.json:
//   allow_origins: "*", allow_methods: "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
//   allow_headers: "*", expose_headers: "*", max_age: 3600, allow_credential: false
//
// allow_headers reflects the browser's actual Access-Control-Request-Headers
// instead of sending a literal "*" — the Fetch spec carves Authorization out
// of a literal wildcard match, so reflecting is the only way "allow any
// header" (the original intent) actually covers Bearer-token requests too.
function buildCorsHeaders(request: NextRequest): Record<string, string> {
  const requestedHeaders = request.headers.get("access-control-request-headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": requestedHeaders || "*",
    "Access-Control-Expose-Headers": "*",
    "Access-Control-Max-Age": "3600",
  };
}

export function middleware(request: NextRequest) {
  const corsHeaders = buildCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
