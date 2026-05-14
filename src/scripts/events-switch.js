import gsap from "gsap";

document.addEventListener("DOMContentLoaded", () => {
  const coverHoldMs = 420;
  const tabs = Array.from(document.querySelectorAll("[data-event-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-event-panel]"));
  const miniGrid = document.querySelector(".transition-grid-small");
  const blocks = miniGrid
    ? Array.from(miniGrid.querySelectorAll(".transition-block"))
    : [];
  let isSwitching = false;

  if (!tabs.length || !panels.length) return;

  function layoutOverlay() {
    if (!miniGrid) return false;

    const panelsRoot = document.querySelector(".events-panels");
    if (!panelsRoot) return false;

    const rect = panelsRoot.getBoundingClientRect();
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    const width = window.innerWidth;
    const height = Math.max(0, bottom - top);
    if (width <= 0 || height <= 0) return false;

    const cellSize = width < 700 ? 32 : width < 1200 ? 40 : 48;
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);

    miniGrid.style.setProperty("--event-switch-cell", `${cellSize}px`);
    miniGrid.style.setProperty("--event-switch-cols", `${cols}`);
    miniGrid.style.width = `${cols * cellSize}px`;
    miniGrid.style.height = `${rows * cellSize}px`;
    miniGrid.style.top = `${top}px`;
    miniGrid.style.left = "0";
    miniGrid.style.visibility = "visible";

    return Math.min(rows * cols, blocks.length);
  }

  function hideOverlay() {
    if (!miniGrid) return;
    miniGrid.style.visibility = "hidden";
  }

  function setTabsLocked(locked) {
    tabs.forEach((tab) => {
      tab.disabled = locked;
      tab.setAttribute("aria-disabled", locked ? "true" : "false");
    });
  }

  function setActive(status) {
    tabs.forEach((tab) => {
      const active = tab.dataset.eventTab === status;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });

    panels.forEach((panel) => {
      const active = panel.dataset.eventPanel === status;
      panel.classList.toggle("is-active", active);
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    });
  }

  function animateSwitch(nextStatus) {
    if (!blocks.length) {
      setActive(nextStatus);
      return;
    }

    isSwitching = true;
    setTabsLocked(true);

    const visibleBlockCount = layoutOverlay();
    const visibleBlocks =
      typeof visibleBlockCount === "number"
        ? blocks.slice(0, visibleBlockCount)
        : [];
    const shuffled = [...visibleBlocks].sort(() => Math.random() - 0.5);
    gsap.killTweensOf(blocks);
    gsap.set(blocks, { opacity: 0 });

    if (!visibleBlocks.length) {
      setActive(nextStatus);
      setTabsLocked(false);
      isSwitching = false;
      return;
    }

    gsap.to(shuffled, {
      opacity: 1,
      duration: 0.035,
      stagger: { amount: 0.18, from: "random" },
      ease: "power2.inOut",
      onComplete: () => {
        setActive(nextStatus);
        window.setTimeout(() => {
          gsap.to(shuffled, {
            opacity: 0,
            duration: 0.06,
            stagger: { amount: 1.1, from: "random" },
            ease: "power2.inOut",
            onComplete: () => {
              hideOverlay();
              setTabsLocked(false);
              isSwitching = false;
            },
          });
        }, coverHoldMs);
      },
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const status = tab.dataset.eventTab;
      if (!status || isSwitching || tab.classList.contains("is-active")) return;
      animateSwitch(status);
    });
  });
});
