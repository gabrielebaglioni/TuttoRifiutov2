// navigation clock with blinking colon
const clockEl = document.querySelector(".nav-clock p");
const hoursEl = clockEl.querySelector('[data-content-key="global.nav.clock_hours"]');
const minutesEl = clockEl.querySelector('[data-content-key="global.nav.clock_minutes"]');
const timeZoneEl = clockEl.querySelector('[data-content-key="global.nav.clock_timezone"]');
const colonEl = clockEl.querySelector("[data-clock-colon]");

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
  hoursEl.textContent = hours;
  minutesEl.textContent = minutes;
  timeZoneEl.textContent = timeZone;
}

function blinkColon() {
  colonEl.style.visibility =
    colonEl.style.visibility === "hidden" ? "visible" : "hidden";
}

updateClock();
setInterval(updateClock, 1000);
setInterval(blinkColon, 500);
