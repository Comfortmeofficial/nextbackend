const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Direct port of providers/expo_provider.py.
export async function sendPush(
  pushToken: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
    console.warn(`Invalid or missing Expo push token: ${pushToken}`);
    return false;
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        sound: "default",
        data: data ?? {},
      }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (result?.data?.status === "error") {
      console.error("Expo push error:", result);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Expo push exception:", error);
    return false;
  }
}
