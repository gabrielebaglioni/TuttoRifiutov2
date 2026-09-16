const EVENT_GROUP_BY_STATUS = Object.freeze({
  upcoming: "upcoming",
  published: "upcoming",
  past: "past",
  draft: null,
});

export type EventStatus = keyof typeof EVENT_GROUP_BY_STATUS;
export type PublicEventGroup = Exclude<(typeof EVENT_GROUP_BY_STATUS)[EventStatus], null>;
export interface EventWithStatus {
  status?: unknown;
}

export function publicEventGroup(status: unknown): PublicEventGroup | null {
  return typeof status === "string" && isKnownEventStatus(status)
    ? EVENT_GROUP_BY_STATUS[status]
    : null;
}

export function isKnownEventStatus(status: unknown): status is EventStatus {
  return typeof status === "string" && Object.prototype.hasOwnProperty.call(EVENT_GROUP_BY_STATUS, status);
}

export function isPublicEventStatus(status: unknown): boolean {
  return publicEventGroup(status) !== null;
}

export function eventsForPublicGroup<Event extends EventWithStatus>(events: readonly Event[], group: PublicEventGroup): Event[];
export function eventsForPublicGroup(events: unknown, group: unknown): EventWithStatus[];
export function eventsForPublicGroup(events: unknown, group: unknown): EventWithStatus[] {
  if (!Array.isArray(events) || (group !== "upcoming" && group !== "past")) return [];
  return events.filter((event): event is EventWithStatus => (
    typeof event === "object" && event !== null && publicEventGroup(Reflect.get(event, "status")) === group
  ));
}
