import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// pacchetti lasciati per le strade — nome & luogo del drop
const clientsData = [
  { name: "Parole Rotte", project: "Trastevere" },
  { name: "Suoni Sporchi", project: "Pigneto" },
  { name: "Pellicole in Scadenza", project: "San Lorenzo" },
  { name: "Fantasie Usate", project: "Centocelle" },
  { name: "Immagini Trovate", project: "Testaccio" },
  { name: "Zine n°03", project: "Garbatella" },
  { name: "Poesia Fotocopiata", project: "Quadraro" },
  { name: "Cassetta Rumore", project: "Ostiense" },
  { name: "Super 8 Scartato", project: "Esquilino" },
  { name: "Manifesto Strappato", project: "Tiburtino" },
  { name: "Collage Anonimo", project: "Prenestino" },
  { name: "Lettere Perdute", project: "Tuscolano" },
  { name: "Frammenti", project: "Appio" },
  { name: "Scarti Sonori", project: "Monteverde" },
  { name: "Residui", project: "Flaminio" },
  { name: "Pacchetto #12", project: "Aventino" },
  { name: "Rovistare / Ritrovarsi", project: "Celio" },
  { name: "Nessuna Spiegazione", project: "Nomentano" },
];

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

// scroll animation - gap closes and opacity fades in
function initClientsAnimation() {
  const clientRows = document.querySelectorAll(".client-row");

  clientRows.forEach((row) => {
    const paragraphs = row.querySelectorAll("p");

    ScrollTrigger.create({
      trigger: row,
      start: "top 50%",
      end: "top 35%",
      scrub: true,
      onUpdate: (self) => {
        const progress = self.progress;
        gsap.set(row, { gap: `${29 - progress * 27}%` });
        paragraphs.forEach((p) => gsap.set(p, { opacity: progress }));
      },
    });
  });
}
