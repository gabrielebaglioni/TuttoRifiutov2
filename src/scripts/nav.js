// navigation clock with blinking colon
const clockEl = document.querySelector(".nav-clock p");
const colonEl = clockEl.querySelector("span");

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
  clockEl.childNodes[0].textContent = `${hours} `;
  clockEl.childNodes[2].textContent = ` ${minutes} ${timeZone}`;
}

function blinkColon() {
  colonEl.style.visibility =
    colonEl.style.visibility === "hidden" ? "visible" : "hidden";
}

updateClock();
setInterval(updateClock, 1000);
setInterval(blinkColon, 500);
