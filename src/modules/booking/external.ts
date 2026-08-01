import { getBus } from "@/modules/buses/repository";
import { getDriver } from "@/modules/drivers/repository";
import {
  sendRentalPricedNotification,
  sendRentalRejectedNotification,
} from "@/modules/notifications/service";
import { getUser } from "@/modules/users/repository";
import type { RentalRow } from "./types";

// driver_service, bus_service, user_service, and notification_service are
// all in this same app now, so what were HTTP calls in handler.go
// (fetchDriverInfo, fetchBusInfo, fetchUserContact, notifyRentalEvent) are
// direct calls here. Google Directions stays a real external HTTP call —
// that's genuinely outside this platform.

export interface DriverInfo {
  fullName: string;
  rating: number;
}

// CreateRide/UpdateRideDriver map ANY resolution failure — 404, or literally
// anything else — to the same 400 "driver_service returned status ..." style
// message. Preserved here as a single thrown error with a message shaped the
// same way, regardless of root cause.
export async function fetchDriverInfo(driverId: number): Promise<DriverInfo> {
  try {
    const driver = await getDriver(driverId);
    return {
      fullName: `${driver.first_name} ${driver.last_name}`.trim(),
      rating: driver.rating,
    };
  } catch {
    throw new Error(`driver ${driverId} not found`);
  }
}

export interface BusSeatDef {
  seat_number: string;
  row: number;
  col: number;
  is_seat: boolean;
  seat_type: string;
}

export interface BusInfo {
  plateNumber: string;
  model: string;
  seats: BusSeatDef[] | null;
}

export async function fetchBusInfo(busId: number): Promise<BusInfo> {
  try {
    const bus = await getBus(busId);
    return {
      plateNumber: bus.plate_number,
      model: bus.model,
      seats: bus.layout.seats,
    };
  } catch {
    throw new Error(`bus ${busId} not found`);
  }
}

// Best-effort, matching notifyRentalEvent exactly: a lookup or send failure
// must never surface to the admin action that triggered it.
export async function notifyRentalEvent(rental: RentalRow, kind: "priced" | "rejected"): Promise<void> {
  try {
    const user = await getUser(rental.user_id);
    if (!user) return;
    const payload = {
      user_id: rental.user_id,
      rental_id: rental.id,
      pickup: rental.pickup,
      destination: rental.destination,
      amount: rental.amount,
      phone: user.phone,
      email: user.email,
      push_token: user.push_notifications_enabled ? user.push_token : undefined,
    };
    if (kind === "priced") {
      await sendRentalPricedNotification(payload);
    } else {
      await sendRentalRejectedNotification(payload);
    }
  } catch {
    // best-effort — swallow everything, same as the source.
  }
}

interface DirectionsResponse {
  status: string;
  routes?: Array<{
    legs?: Array<{
      duration?: { value: number };
      distance?: { value: number };
    }>;
  }>;
}

// fetchRouteETA calls the Google Directions API once for a given origin/
// destination pair — genuinely external, kept as a real HTTP call.
export async function fetchRouteETA(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ durationMinutes: number; distanceKm: number }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&key=${apiKey}`;

  let data: DirectionsResponse;
  try {
    const response = await fetch(url);
    data = await response.json();
  } catch (err) {
    throw new Error(`google directions api unreachable: ${err}`);
  }

  const leg = data.routes?.[0]?.legs?.[0];
  if (data.status !== "OK" || !leg) {
    throw new Error(`directions api returned status "${data.status}"`);
  }
  return {
    durationMinutes: Math.floor((leg.duration?.value ?? 0) / 60),
    distanceKm: (leg.distance?.value ?? 0) / 1000,
  };
}
