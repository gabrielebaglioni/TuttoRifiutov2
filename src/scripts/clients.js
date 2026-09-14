import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SITE_CONTENT } from "../data/site-content.js";

gsap.registerPlugin(ScrollTrigger);

// pacchetti lasciati per le strade — nome & luogo del drop
let clientsData = SITE_CONTENT["home.clients.rows"].map(([name, project]) => ({ name, project }));
let clientTriggers = [];

// initialization
document.addEventListener("DOMContentLoaded", () => {
  generateClientsList();

  setTimeout(() => {
    ScrollTrigger.refresh();
    initClientsAnimation();
  }, 100);
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
    nameP.textContent = client.name;

    const projectP = document.createElement("p");
    projectP.className = "type-mono";
    projectP.textContent = client.project;

    row.appendChild(nameP);
    row.appendChild(projectP);
    clientsList.appendChild(row);
  });
}

document.addEventListener("tutto-rifiuto:content", (event) => {
  const rows = event.detail?.["home.clients.rows"];
  if (!Array.isArray(rows) || !rows.every((row) => Array.isArray(row) && row.length === 2 && row.every((value) => typeof value === "string"))) return;
  clientsData = rows.map(([name, project]) => ({ name, project }));
  generateClientsList();
  ScrollTrigger.refresh();
  initClientsAnimation();
});

// scroll animation - gap closes and opacity fades in
function initClientsAnimation() {
  clientTriggers.forEach((trigger) => trigger.kill());
  clientTriggers = [];
  const clientRows = document.querySelectorAll(".client-row");

  clientRows.forEach((row) => {
    const paragraphs = row.querySelectorAll("p");

    clientTriggers.push(ScrollTrigger.create({
      trigger: row,
      start: "top 50%",
      end: "top 35%",
      scrub: true,
      onUpdate: (self) => {
        const progress = self.progress;
        gsap.set(row, { gap: `${29 - progress * 27}%` });
        paragraphs.forEach((p) => gsap.set(p, { opacity: progress }));
      },
    }));
  });
}
