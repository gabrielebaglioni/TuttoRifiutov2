const EVENT_GROUP_BY_STATUS = Object.freeze({
  upcoming: "upcoming",
  published: "upcoming",
  past: "past",
  draft: null,
});

export function publicEventGroup(status) {
  return Object.prototype.hasOwnProperty.call(EVENT_GROUP_BY_STATUS, status)
    ? EVENT_GROUP_BY_STATUS[status]
    : null;
}

export function isKnownEventStatus(status) {
  return Object.prototype.hasOwnProperty.call(EVENT_GROUP_BY_STATUS, status);
}

export function isPublicEventStatus(status) {
  return publicEventGroup(status) !== null;
}

export function eventsForPublicGroup(events, group) {
  if (!Array.isArray(events) || !["upcoming", "past"].includes(group)) return [];
  return events.filter((event) => publicEventGroup(event?.status) === group);
}
