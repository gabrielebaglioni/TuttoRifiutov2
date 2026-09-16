import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SITE_CONTENT } from "../data/site-content.ts";
import { contentReady } from "./content-hydration.ts";
import { clientMotion, prefersReducedMotion } from "./motion-policy.ts";

gsap.registerPlugin(ScrollTrigger);

// pacchetti lasciati per le strade — nome & luogo del drop
let clientsData = SITE_CONTENT["home.clients.rows"].map(([name, project]) => ({ name, project }));
let clientTriggers: ScrollTrigger[] = [];

// initialization
document.addEventListener("DOMContentLoaded", () => {
  generateClientsList();

  Promise.all([document.fonts.ready, contentReady]).then(() => {
    initClientsAnimation();
    ScrollTrigger.sort();
    ScrollTrigger.refresh(true);
  });
});

// generate client rows from data
function generateClientsList() {
  const clientsList = document.querySelector(".clients-list");
  if (!clientsList) return;
  clientsList.replaceChildren();

  clientsData.forEach((client) => {
    const row = document.createElement("div");
    row.className = "client-row";

    const nameP = document.createElement("p");
    nameP.className = "type-mono";
    nameP.textContent = client.name ?? '';

    const projectP = document.createElement("p");
    projectP.className = "type-mono";
    projectP.textContent = client.project ?? '';

    row.appendChild(nameP);
    row.appendChild(projectP);
    clientsList.appendChild(row);
  });
}

document.addEventListener("tutto-rifiuto:content", (event) => {
  const rows = event.detail?.["home.clients.rows"];
  if (!Array.isArray(rows) || !rows.every((row: unknown): row is [string, string] => Array.isArray(row) && row.length === 2 && row.every((value: unknown) => typeof value === "string"))) return;
  clientsData = rows.map(([name, project]) => ({ name, project }));
  generateClientsList();
  initClientsAnimation();
  ScrollTrigger.refresh(true);
});

// scroll animation - gap closes and opacity fades in
function initClientsAnimation() {
  clientTriggers.forEach((trigger) => trigger.kill());
  clientTriggers = [];
  const clientRows = document.querySelectorAll(".client-row");
  if (prefersReducedMotion()) {
    gsap.set(document.querySelectorAll('.client-row p'), { opacity: 1, x: 0 });
    return;
  }

  clientRows.forEach((row) => {
    const paragraphs = row.querySelectorAll("p");
    const [left, right] = paragraphs;
    if (!left || !right) return;

    let width = row.clientWidth;
    const render = (self: ScrollTrigger) => {
      const { opacity, offset } = clientMotion(0.95 - self.progress * 0.3);
      gsap.set(left, { opacity, x: -width * offset / 100 });
      gsap.set(right, { opacity, x: width * offset / 100 });
    };
    clientTriggers.push(ScrollTrigger.create({
      trigger: row,
      start: "top 95%",
      end: "top 65%",
      scrub: true,
      onUpdate: render,
      onRefresh: (self) => { width = row.clientWidth; render(self); },
    }));
  });
}
