import bruciaRifiuti from "../assets/eventi/bruciaRifiuti.png";
import attachinoMorto from "../assets/eventi/attachinoMorto.png";
import saltaRifiuti from "../assets/eventi/saltaRifiuti.png";
import storiaDiUnFallimento from "../assets/eventi/storiaDiUnFallimento.png";
import letture from "../assets/eventi/letture.png";
import giornataTR from "../assets/eventi/giornataTR.jpg";
import nucleare from "../assets/eventi/nucleare.png";
import pianetaSonoro from "../assets/eventi/pianetaSonoro.png";
import work01 from "../assets/work/work_01.jpg";
import work02 from "../assets/work/work_02.jpg";
import work03 from "../assets/work/work_03.jpg";
import work04 from "../assets/work/work_04.jpg";
import work05 from "../assets/work/work_05.jpg";

export const events = [
  {
    slug: "giornata-tutto-rifiuto",
    title: "Giornata Tutto Rifiuto",
    code: "TR·E—01",
    status: "upcoming",
    summary: "Una giornata intera: banchetti, musica, installazioni, persone",
    seo: {
      title: "Giornata Tutto Rifiuto — Eventi | Tutto Rifiuto",
      description:
        "Giornata Tutto Rifiuto: banchetti con arte autoprodotta, concerti, installazioni e incontri per una giornata intera.",
    },
    cardMedia: { type: "image", src: bruciaRifiuti, alt: "Manifesto grafico Tutto Rifiuto in fiamme" },
    heroMedia: { type: "image", src: work01, alt: "Dettaglio visivo di una giornata Tutto Rifiuto" },
    meta: ["Banchetti & arte autoprodotta", "Concerti & live", "Installazioni & incontri"],
    description:
      "La Giornata Tutto Rifiuto è un blocco unico: partiamo e chiudiamo quando ci stanca il corpo. Dentro ci sono banchetti con roba autoprodotta, concerti che escono dal telefono, installazioni appoggiate dove capita, voci che si fermano e altre che attraversano lo spazio. Niente pie chart: più ore passano, più la giornata si piega da sola.",
    info: [
      [["Collettivo", "Tutto Rifiuto"], ["Contenuti", "Arte autoprodotta, musica dal vivo, installazioni"]],
      [["Città", "Roma — su richiesta"], ["Durata", "Giornata intera (da concordare)"]],
    ],
    detailMedia: [
      { type: "image", src: giornataTR, alt: "Materiale grafico per Giornata Tutto Rifiuto" },
      { type: "image", src: work02, alt: "Banchetti e materiali autoprodotti" },
      { type: "image", src: work03, alt: "Dettaglio archivio Tutto Rifiuto" },
    ],
    outro:
      "Se gestisci uno spazio che regge volume, persone che entrano e escono, e non ti spaventa lasciare le cose un po' appoggiate, questa è la formula per cui ci scriviamo. Portiamo il carico creativo; tu ci metti la porta, qualche presa e la pazienza di un giorno intero.",
    outroInfo: [[["Calendario", "Su richiesta"], ["Stato", "In agenda"]], [["Tema", "Giornate piene"], ["Formato", "Evento a tiro lungo"]]],
  },
  {
    slug: "proiezioni",
    title: "Proiezioni",
    code: "TR·E—02",
    status: "upcoming",
    summary: "Corti, film, pomeriggi e serate con artisti dalla scena romana e non",
    seo: {
      title: "Proiezioni Tutto Rifiuto — Eventi | Tutto Rifiuto",
      description:
        "Proiezioni Tutto Rifiuto: corti, film, serate e pomeriggi con artisti dalla scena romana e non.",
    },
    cardMedia: { type: "image", src: attachinoMorto, alt: "Poster grafico per proiezioni Tutto Rifiuto" },
    heroMedia: { type: "image", src: work05, alt: "Immagine evento proiezioni Tutto Rifiuto" },
    meta: ["Schermo & suono", "Scena romana & ospiti", "Formato flessibile"],
    description:
      "Le proiezioni Tutto Rifiuto sono serate o pomeriggi in cui passiamo corti, film, materiali di archivio o quello che ci capita tra le mani. Lavoriamo con persone che vengono dalla scena romana e da fuori: niente palinsesto da festival corporate, solo un filo che tiene insieme immagini e rumore.",
    info: [
      [["Collettivo", "Tutto Rifiuto"], ["Contenuti", "Cinema, video, corti, sperimentale"]],
      [["Città", "Roma — sale e spazi"], ["Fascia oraria", "Pomeriggio o sera"]],
    ],
    detailMedia: [
      { type: "image", src: nucleare, alt: "Grafica nucleare per proiezioni" },
      { type: "image", src: attachinoMorto, alt: "Manifesto proiezioni Tutto Rifiuto" },
      { type: "image", src: work05, alt: "Frame visivo proiezione" },
    ],
    outro:
      "Se gestisci uno spazio con luce soffusa, sedute e un posto dove appendere o appoggiare uno schermo, questa scheda è per te. Il rifiuto qui è la lista rigida: mettiamo in circolo immagini senza paura di mescolare generi e lunghezze.",
    outroInfo: [[["Calendario", "Su richiesta"], ["Stato", "In agenda"]], [["Tema", "Immagini in circolo"], ["Formato", "Proiezione + discussione"]]],
  },
  {
    slug: "musica",
    title: "Musica",
    code: "TR·E—03",
    status: "upcoming",
    summary: "Techno, elettronica, indie e sperimentale in formati piccoli o storti",
    seo: {
      title: "Musica Tutto Rifiuto — Eventi | Tutto Rifiuto",
      description:
        "Serate musicali Tutto Rifiuto: techno, elettronica, indie e sperimentale. Collettivo romano.",
    },
    cardMedia: { type: "image", src: saltaRifiuti, alt: "Grafica evento musicale Tutto Rifiuto" },
    heroMedia: { type: "image", src: work02, alt: "Evento musicale Tutto Rifiuto" },
    meta: ["Dancefloor & ascolto", "Live & DJ", "Roma & ospiti"],
    description:
      "La musica Tutto Rifiuto non sta in un'etichetta sola: ci sono serate che tirano verso techno ed elettronica, altre che attraversano indie e sperimentale. Ciò che ci lega è il rifiuto del formato commerciale unico: preferiamo suoni che sporcano il pavimento o che chiedono silenzio, purché restino onesti.",
    info: [
      [["Collettivo", "Tutto Rifiuto"], ["Contenuti", "Techno, elettronica, indie, sperimentale"]],
      [["Città", "Roma — locali & spazi"], ["Volume", "Da concordare col locale"]],
    ],
    detailMedia: [
      { type: "image", src: pianetaSonoro, alt: "Pianeta sonoro Tutto Rifiuto" },
      { type: "image", src: work03, alt: "Immagine sonora Tutto Rifiuto" },
      { type: "image", src: work04, alt: "Materiale evento musica" },
    ],
    outro:
      "Se il tuo spazio ha cassa, acustica decente e non ti spaventa alternare notti diverse, questa è la tipologia che ti dice se conviene ospitare il collettivo. Parliamo di impianto, orari e vicinato prima di alzare i bassi.",
    outroInfo: [[["Calendario", "Su richiesta"], ["Stato", "In agenda"]], [["Tema", "Suoni che sporcano il pavimento"], ["Formato", "Serata live / DJ"]]],
  },
  {
    slug: "serigrafia",
    title: "Serigrafia",
    code: "TR·E—04",
    status: "past",
    summary: "Magliette e stampe fatte in casa, telai adattati e immagini autoprodotte",
    seo: {
      title: "Serigrafia Tutto Rifiuto — Eventi | Tutto Rifiuto",
      description:
        "Serigrafia Tutto Rifiuto: magliette e stampe fatte in casa, telai adattati a copertine e immagini autoprodotte.",
    },
    cardMedia: { type: "image", src: storiaDiUnFallimento, alt: "Grafica serigrafia Tutto Rifiuto" },
    heroMedia: { type: "image", src: work04, alt: "Serigrafia Tutto Rifiuto" },
    meta: ["Magliette & fogli", "Telai adattati", "Copertine autoprodotte"],
    description:
      "Ogni telaio che montiamo è un pezzo adattato: partiamo da copertine, immagini autoprodotte e grafiche che già circolano nel collettivo. Poi stampiamo magliette e fogli su richiesta, con tempi umani e errori inclusi. Non è una linea industriale: è manifattura rifiuto, fatta per chi vuole indossare o appendere qualcosa di non perfettamente uniforme.",
    info: [
      [["Collettivo", "Tutto Rifiuto"], ["Contenuti", "Serigrafia, tessuti, carta"]],
      [["Città", "Roma — laboratorio mobile"], ["Tiratura", "Piccola, su ordinazione"]],
    ],
    detailMedia: [
      { type: "image", src: storiaDiUnFallimento, alt: "Storia di un fallimento, grafica serigrafica" },
      { type: "image", src: work01, alt: "Materiale stampato" },
      { type: "image", src: work05, alt: "Archivio grafico serigrafia" },
    ],
    outro:
      "Se hai uno spazio che può ospitare un tavolo, un po' di macchie e un pomeriggio di prove, questa tipologia è quella giusta. Non vendiamo stock infinito: coordiniamo sessioni di stampa e portiamo il resto con noi.",
    outroInfo: [[["Calendario", "Su richiesta"], ["Stato", "Passati"]], [["Tema", "Manifattura autoprodotto"], ["Formato", "Laboratorio / sessione"]]],
  },
  {
    slug: "letture",
    title: "Letture",
    code: "TR·E—05",
    status: "past",
    summary: "Giornate e serate di voci, testi, poesia e prosa",
    seo: {
      title: "Letture Tutto Rifiuto — Eventi | Tutto Rifiuto",
      description:
        "Giornate e serate di letture Tutto Rifiuto: voci, testi, poesia e prosa in spazi che ospitano parole.",
    },
    cardMedia: {
      type: "video",
      src: "/eventi/eventi-copertina-letture.mp4",
      poster: letture,
      alt: "Video copertina letture Tutto Rifiuto",
    },
    heroMedia: { type: "image", src: work03, alt: "Letture Tutto Rifiuto" },
    meta: ["Voci & testi", "Autoproduzione", "Spazi raccolti"],
    description:
      "Le letture Tutto Rifiuto sono appuntamenti in cui portiamo voci del collettivo e ospiti: poesia, prosa, testi nati fuori dagli schemi editoriali. Cerchiamo spazi piccoli o medi, dove l'ascolto regge più del microfono perfetto. L'obiettivo è far capire a chi tiene le chiavi: qui si lavora con parole, non con cartelloni.",
    info: [
      [["Collettivo", "Tutto Rifiuto"], ["Contenuti", "Poesia, prosa, zine, voci"]],
      [["Città", "Roma — librerie & spazi"], ["Posti", "Seduti in cerchio o file"]],
    ],
    detailMedia: [
      {
        type: "video",
        src: "/eventi/eventi-copertina-letture.mp4",
        poster: letture,
        alt: "Video letture Tutto Rifiuto",
      },
      { type: "image", src: letture, alt: "Copertina letture Tutto Rifiuto" },
      { type: "image", src: work01, alt: "Materiale scritto Tutto Rifiuto" },
    ],
    outro:
      "Se il tuo spazio è fatto per fermarsi, alzare gli occhi dal telefono e ascoltare, questa è la tipologia che ti dice se siamo compatibili. Portiamo il programma; tu ci metti sedie, acqua e l'idea che le parole possano occupare una stanza come fanno i corpi.",
    outroInfo: [[["Calendario", "Su richiesta"], ["Stato", "Passati"]], [["Tema", "Parole in stanza"], ["Formato", "Lettura + dialogo"]]],
  },
];

export const eventGroups = {
  upcoming: events.filter((event) => event.status === "upcoming"),
  past: events.filter((event) => event.status === "past"),
};

export function getEventBySlug(slug) {
  return events.find((event) => event.slug === slug);
}
