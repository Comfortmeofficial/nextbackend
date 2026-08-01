import jwt from "jsonwebtoken";

// Distinct from src/modules/auth/jwt.ts's JWT_SECRET (customer tokens) even
// though the legacy driver_service's own env var is *also* named JWT_SECRET
// — the two are different secrets belonging to different services that just
// happen to share a name in their own separate processes. Naming this one
// DRIVER_JWT_SECRET avoids conflating them now that both live in this app.
//
// IMPORTANT: booking_service (still unmigrated, Go) verifies driver-portal
// tokens locally using its own JWT_SECRET env var and expects it to hold the
// same value as this one. Keep them in sync at deploy time.
const SECRET = process.env.DRIVER_JWT_SECRET || "change_me_in_production";
const ACCESS_TTL = "12h";
const REFRESH_TTL = "30d";

type TokenType = "access" | "refresh";

interface DriverTokenClaims {
  sub: string;
  type: TokenType;
}

function createToken(driverId: number, type: TokenType, expiresIn: string): string {
  const payload: DriverTokenClaims = { sub: String(driverId), type };
  // noTimestamp matches PyJWT's behavior here — jwt.encode() in the source
  // service never adds an iat claim, only sub/type/exp.
  return jwt.sign(payload, SECRET, { expiresIn, noTimestamp: true } as jwt.SignOptions);
}

export function createAccessToken(driverId: number): string {
  return createToken(driverId, "access", ACCESS_TTL);
}

export function createRefreshToken(driverId: number): string {
  return createToken(driverId, "refresh", REFRESH_TTL);
}

// Returns the driver_id encoded in the token, or throws.
export function decodeToken(token: string, expectedType: TokenType): number {
  let payload: DriverTokenClaims;
  try {
    payload = jwt.verify(token, SECRET) as unknown as DriverTokenClaims;
  } catch {
    throw new Error("invalid token");
  }
  if (payload.type !== expectedType) {
    throw new Error(`expected a ${expectedType} token`);
  }
  return Number(payload.sub);
}
