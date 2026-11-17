export type TelemetryEventName =
  | "tryon_open"
  | "camera_granted"
  | "camera_denied"
  | "tryon_ready"
  | "variant_selected"
  | "tryon_error"
  | "purchase_click";

export interface TelemetryEvent {
  name: TelemetryEventName;
  timestamp: string;
  sku?: string;
  variantId?: string;
  errorCode?: string;
  source?: string;
}

const recentEvents: TelemetryEvent[] = [];

/**
 * Emits privacy-safe journey events. Never accepts frames, landmarks, or facial identifiers.
 */
export function trackEvent(
  name: TelemetryEventName,
  payload: Omit<TelemetryEvent, "name" | "timestamp"> = {}
): TelemetryEvent {
  const event: TelemetryEvent = {
    name,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  recentEvents.unshift(event);
  if (recentEvents.length > 25) {
    recentEvents.pop();
  }

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.info("[Encantadas Telemetry]", event);
  }

  return event;
}

export function getRecentTelemetryEvents(): TelemetryEvent[] {
  return [...recentEvents];
}
