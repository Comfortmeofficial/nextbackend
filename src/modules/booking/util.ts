import { NextResponse } from "next/server";

// Mirrors handler.go's parseID exactly, including its odd edge case: a
// non-numeric id writes a 400 itself and returns 0; the *caller* then does
// `if id == 0 { return }` with no further response written, which Gin
// defaults to an empty 200 body. Literal id=0 in a URL is vanishingly rare
// in practice, but this same helper backs ~35 endpoints, so getting the
// three-way branch right here is worth it once rather than getting it wrong
// 35 times.
export function parseBookingId(raw: string): number | NextResponse {
  if (!/^\d+$/.test(raw)) {
    return NextResponse.json({ detail: "invalid id" }, { status: 400 });
  }
  const id = Number(raw);
  if (id === 0) {
    return new NextResponse(null, { status: 200 });
  }
  return id;
}
