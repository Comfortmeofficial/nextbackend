import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Next.js 308-redirects trailing-slash paths (/users/ ->
  // /users) before middleware runs, so that redirect response carries no
  // CORS headers. A browser's preflight doesn't follow redirects, so it
  // just sees a header-less 308 and blocks the request. Several UI call
  // sites use trailing slashes (users/, drivers/, referrals/, terms/),
  // mirroring the original FastAPI/Express routers' own "/" list routes,
  // which never redirected either — so skipping the redirect here also
  // restores that original zero-redirect behavior, not just fixing CORS.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
