const sections: Record<string, string> = {
  "home.hero": "Home · Apertura e slogan",
  "home.about": "Home · Racconto della storia del collettivo",
  "home.transition": "Home · Sezione animazione del pacchetto",
  "home.how_it_works": "Home · Come funziona il collettivo",
  "home.clients": "Home · Avvistamenti per strada",
  "archive.hero": "Archivio · Intestazione della pagina",
  "archive.detail": "Archivio · Informazioni del pacchetto",
  "events.hero": "Eventi · Intestazione e filtro agenda/passato",
  "contact.info": "Contatti · Recapiti e informazioni",
  "contact.footer": "Contatti · Chiusura della pagina",
  "global.footer": "Footer · Collegamenti e testi in fondo al sito",
  "global.menu": "Menu · Navigazione e collegamenti",
  "global.nav": "Navigazione · Ora e luogo",
  "global.preloader": "Caricamento iniziale · Didascalia",
  "global.logo": "Logo · Collegamento alla home",
};
const fields: Record<string, string> = {
  title: "Titolo", subtitle: "Sottotitolo", description: "Descrizione principale",
  summary: "Breve presentazione", intro: "Testo introduttivo", paragraphs: "Paragrafi del racconto",
  items: "Elenco delle voci", rows: "Righe di testo", code: "Codice del pacchetto o evento",
  meta: "Categorie e informazioni iniziali", info: "Informazioni di dettaglio",
  details: "Scheda descrittiva", outro: "Testo conclusivo", outroInfo: "Informazioni finali",
  slug: "Indirizzo della pagina (slug)", href: "Destinazione del collegamento",
  status: "Gruppo: upcoming = in agenda, past = del passato",
  seo: "Anteprima nei motori di ricerca", position: "Ordine di visualizzazione (parte da 0)",
  name: "Nome del sito", package_label: "Etichetta del pacchetto", materials_label: "Didascalia dei materiali",
  upcoming_label: "Nome del filtro in agenda", past_label: "Nome del filtro del passato",
  tab_prefix: "Parentesi di apertura", tab_suffix: "Parentesi di chiusura", tab_separator: "Separatore centrale",
  left_label: "Etichetta a sinistra", right_label: "Etichetta a destra",
  context_label: "Etichetta di contesto", status_label: "Etichetta dello stato", status_value: "Testo dello stato",
  location: "Luogo e anno", quote: "Frase conclusiva", location_label: "Nome e luogo",
  clock_hours: "Ora iniziale", clock_minutes: "Minuti iniziali", clock_timezone: "Fuso orario",
  image_alt: "Descrizione dell’immagine per l’accessibilità", home_href: "Destinazione del logo",
};
export function fieldLabel(path: string) {
  const parts = path.split(".");
  const last = parts.at(-1) ?? "";
  if (/^\d+$/.test(last)) {
    if (path.includes("home.how_it_works.items.")) return ["Numero", "Descrizione del passaggio", "Parola chiave"][Number(last) - 1] || "Contenuto";
    if (path.includes("home.clients.rows.")) return Number(last) === 1 ? "Nome dell’avvistamento" : "Quartiere";
    if (/(info|Info|details|rows|items)\./.test(path)) return Number(last) === 1 ? "Etichetta della riga" : "Contenuto della riga";
    return "Testo " + last;
  }
  if (fields[last]) return fields[last];
  if (last.endsWith("_label")) return "Testo del collegamento · " + last.replace("_label", "");
  if (last.endsWith("_href")) return "Destinazione del collegamento · " + last.replace("_href", "");
  return last.replaceAll("_", " ");
}
export function contentLabel(key: string) {
  const group = Object.keys(sections).find((prefix) => key.startsWith(prefix + "."));
  const section = group ? sections[group] : key.startsWith("seo.") ? "Anteprima nei motori di ricerca · " + key.split(".")[1] : key.startsWith("project.") ? "Pacchetto · Pagina di dettaglio" : "Identità del sito";
  return section + " — " + fieldLabel(key);
}
