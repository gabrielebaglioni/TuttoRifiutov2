import { prefersReducedMotion } from './motion-policy.ts';
// navigation clock with blinking colon
const clockEl = document.querySelector(".nav-clock p");
const hoursEl = clockEl?.querySelector('[data-content-key="global.nav.clock_hours"]');
const minutesEl = clockEl?.querySelector('[data-content-key="global.nav.clock_minutes"]');
const timeZoneEl = clockEl?.querySelector('[data-content-key="global.nav.clock_timezone"]');
const colonEl = clockEl?.querySelector<HTMLElement>("[data-clock-colon]");

function getTimeParts() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const timeZone =
    Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value || "";

  return { hours, minutes, timeZone };
}

function updateClock() {
  const { hours, minutes, timeZone } = getTimeParts();
  if (hoursEl) hoursEl.textContent = hours;
  if (minutesEl) minutesEl.textContent = minutes;
  if (timeZoneEl) timeZoneEl.textContent = timeZone;
}

function blinkColon() {
  if (!colonEl) return;
  if (prefersReducedMotion()) { colonEl.style.visibility = 'visible'; return; }
  colonEl.style.visibility =
    colonEl.style.visibility === "hidden" ? "visible" : "hidden";
}

updateClock();
setInterval(updateClock, 1000);
setInterval(blinkColon, 500);
