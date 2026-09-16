import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { runEventTransition } from "./event-transition.ts";

document.addEventListener("DOMContentLoaded", () => {
  const tabs = [...document.querySelectorAll("[data-event-tab]")];
  const panels = [...document.querySelectorAll("[data-event-panel]")];
  const root = document.querySelector(".events-panels");
  const label = document.querySelector(".event-hero-tabs");
  const grid = document.querySelector(".transition-grid-small");
  if (!tabs.length || !panels.length || !root || !label || !grid) return;
  let switching = false;
  let timeline;

  function setActive(status) {
    tabs.forEach((tab) => {
      const active = tab.dataset.eventTab === status;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    panels.forEach((panel) => {
      const active = panel.dataset.eventPanel === status;
      panel.classList.toggle("is-active", active);
      panel.setAttribute("aria-hidden", String(!active));
      panel.inert = !active;
    });
  }
  function finish() {
    grid.style.visibility = "hidden";
    root.style.minHeight = "";
    root.removeAttribute("aria-busy");
    tabs.forEach((tab) => { tab.disabled = false; });
    switching = false;
    window.lenis?.resize();
    ScrollTrigger.refresh(true);
  }
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    const status = tab.dataset.eventTab;
    if (!status || switching || tab.classList.contains("is-active")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(status);
      finish();
      return;
    }
    switching = true;
    tabs.forEach((item) => { item.disabled = true; });
    root.setAttribute("aria-busy", "true");
    root.style.minHeight = root.offsetHeight + "px";
    const top = Math.max(0, label.getBoundingClientRect().bottom);
    const size = 88;
    const cols = Math.ceil(window.innerWidth / size);
    const height = Math.max(0, window.innerHeight - top);
    const count = cols * Math.ceil(height / size);
    const blocks = Array.from({ length: count }, () => {
      const block = document.createElement("div");
      block.className = "transition-block";
      return block;
    });
    grid.replaceChildren(...blocks);
    grid.style.setProperty("--event-switch-cell", size + "px");
    grid.style.setProperty("--event-switch-cols", String(cols));
    grid.style.width = cols * size + "px";
    grid.style.height = height + "px";
    grid.style.top = top + "px";
    grid.style.visibility = "visible";
    if (!count) { setActive(status); finish(); return; }
    timeline = runEventTransition(gsap, blocks, () => {
      setActive(status);
      // When switching deep in a list, reveal the new first event under the fixed label.
      if (label.getBoundingClientRect().top <= 0) {
        if (window.lenis) window.lenis.scrollTo(label, { immediate: true });
        else window.scrollTo({ top: window.scrollY + label.parentElement.getBoundingClientRect().top, behavior: "instant" });
      }
    }, finish);
  }));
  window.addEventListener("resize", () => { if (switching) timeline?.progress(1); });
});
