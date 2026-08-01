import { sendPinCreatedNotification } from "@/modules/notifications/service";
import { getUser } from "@/modules/users/repository";

// Mirrors api/v1/wallet.py::_notify_pin_created. Both the user_service
// lookup and the notification_service call are now direct in-process calls
// — both services live in this app now. Still best-effort: a failure here
// must never surface as a pin-set failure, matching the source's bare
// `except: pass`.
export async function notifyPinCreated(userId: number): Promise<void> {
  try {
    const user = await getUser(userId);
    if (!user) return;
    await sendPinCreatedNotification({
      user_id: userId,
      email: user.email,
      phone: user.phone,
      push_token: user.push_notifications_enabled ? user.push_token : null,
    });
  } catch {
    // best-effort — swallow everything, same as the source.
  }
}
