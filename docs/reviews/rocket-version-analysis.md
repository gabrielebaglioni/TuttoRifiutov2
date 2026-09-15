# Rocket Version — analisi iniziale e matrice degli esperimenti

Data: 15 settembre 2026. Ramo locale: `codex/rocket-version`.
Base stabile: `30df1633be13f9c053ebbfd71e3603bc0571cb02` (`main` e `finalRev` alla creazione).
Nessun aggiornamento delle dipendenze, modifica al runtime, push o deploy eseguito per questa analisi.

## Raccomandazione

Mantenere Astro e il rendering statico del sito pubblico. Introdurre TypeScript gradualmente, separare i moduli di animazione e caricare il codice pesante solo quando serve. Valutare Svelte 5 esclusivamente per un componente admin pilota. Trattare Astro 7.2 come esperimento di toolchain separato, non come presunto rimedio alla fluidità mobile.

JavaScript vanilla e TypeScript non sono due architetture concorrenti: possiamo mantenere DOM, Canvas/WebGL e GSAP imperativi scrivendoli in TypeScript, senza React/Svelte. I tipi non velocizzano automaticamente il JavaScript eseguito dal browser e non sostituiscono la validazione dei dati API.

## Evidenze misurate

Ambiente locale: Node 23.11.0, dipendenze già presenti nella directory antenata, nessuna reinstallazione. Il Node locale è una variabile di laboratorio da normalizzare su LTS per confronti futuri, non una descrizione del runtime Workers pubblico.

| Voce | Baseline osservata |
| --- | --- |
| Astro nel lockfile | 6.3.2 |
| Vite nel lockfile | 7.3.2 |
| GSAP nel lockfile | 3.15.0; package.json dichiara ^3.14.2 |
| Three.js / Lenis | 0.182.0 / 1.3.15 |
| TypeScript come dipendenza esplicita | Assente |
| Test dopo build | 360 passati, 0 falliti |
| Pagine compilate | 13 |
| Prima build nella nuova worktree, tempo totale | 6,59 s |
| Seconda build con cache immagini calda, tempo totale | 2,77 s |
| Worker compilato, non compresso | 735.532 byte |
| Grafo degli import statici JS del BaseLayout | 686.300 byte; somma gzip per file 195.627 byte |
| Chunk Three.js | 482.161 byte; gzip 121.250 byte |
| Chunk denominato ScrollTrigger, inclusi export condivisi | 114.013 byte; gzip 44.946 byte |
| Entry JS BaseLayout | 62.823 byte; gzip 18.538 byte |

Queste sono misure dei file compilati, non un waterfall di rete né tempi di parsing. Gzip locale non equivale al trasferimento effettivo del CDN, che può usare Brotli/cache. Non sommare nuovamente i chunk alla misura del grafo comune. Il nome del chunk non dimostra che contenga solo la libreria omonima.

I tempi di build sono due osservazioni, non mediane statistiche. La prima build include elaborazione delle immagini, non è un'installazione completamente a freddo. I test richiedono `dist/server/index.js`: il primo tentativo prima della build è fallito per artefatto mancante; l'ordine riproducibile è `npm run build` e poi `npm test`.

Log locali: `/private/tmp/rocket-baseline-build.log`, `/private/tmp/rocket-warm-build.log`, `/private/tmp/rocket-baseline-tests.log`.

## Cosa dice il codice

1. `src/scripts/common.js` importa staticamente `menu.js`; questo importa Three.js. Il bundle compilato conferma l'import statico di `three.module`. Quindi un menu chiuso evita il rendering continuo, ma non evita download e valutazione della libreria. Candidato prioritario: separare il renderer dell'atmosfera e importarlo su intenzione/apertura, mantenendo lo sfondo TR e un fallback immediato. La home importa Three anche tramite `skyline.js`: il solo intervento sul menu non elimina Three dalla home.
2. Non ci sono componenti framework con direttive `client:*` nel sorgente attuale. Le interazioni sono script Astro e moduli JS. Il sito beneficia già del rendering HTML di Astro, ma non dell'hydration selettiva dei componenti React/Svelte. Aggiungere un'isola introduce anche il relativo runtime: va giustificato.
3. `tsconfig.json` estende già `astro/tsconfigs/strict`, ma questo non significa che i file JS siano tutti verificati. Non esiste uno script di type-check. Introdurre controllo separato, JSDoc/checkJs per moduli selezionati e successivamente `.ts`.
4. `admin.js` ha 927 righe, `menu.js` 657, `particle-visual.js` 391, `content-hydration.js` 369, `collections-hydration.js` 345. Sono segnali di aree da leggere e separare, non prove automatiche di cattivo codice. Contratti utili: mount/destroy, stato gesti, renderer, repository contenuti, trasporto API, presentazione admin.
5. Molti moduli partono su DOMContentLoaded. Un ClientRouter aggiunto direttamente rischierebbe inizializzazioni mancanti, listener duplicati, ScrollTrigger superstiti e canvas non rilasciati. Prima serve un lifecycle esplicito, idempotente e testato.
6. `scripts/build-worker.mjs` incorpora l'HTML nel Worker e rimuove i file HTML dagli asset statici. `worker/router.js` gestisce anche metadati dinamici e no-store. Non è il percorso standard di un adapter Astro: cache, SSR, Actions e server islands richiedono prima verifica del contratto Sites e delle protezioni DB/media.
7. Il recente `navigation-warmup.js` scalda JS/CSS, non rende cacheabile l'HTML. Va misurato il beneficio contro le richieste extra; non è una garanzia di navigazione istantanea.

## Astro 6 e novità successive

Sono già configurati Fonts API locale, CSP, immagini con Sharp e queued rendering sperimentale: non vanno presentati come ottimizzazioni ancora da attivare.

Astro 7 introduce Vite 8/Rolldown e compilatore Rust, queued rendering stabile, advanced routing e route caching. Astro 7.2 aggiunge build statiche incrementali sperimentali. I guadagni pubblicati dal framework riguardano benchmark di altri siti, non questo sito di 13 pagine. Qui la priorità è misurare compatibilità del compilatore, whitespace dei testi, CSP/hash, output Worker, immagini e snapshot; le build incrementali hanno priorità bassa.

Live Content Collections e server islands sono possibili strumenti per riorganizzare i contenuti, non un upgrade gratuito: introducono rendering runtime/adapter e politiche di cache. Il requisito che una modifica admin sia subito visibile impone invalidazione affidabile, esclusione di sessioni/bozze e test di concorrenza. Non attivare cache generica su HTML/API.

## Tecnologie e trade-off

| Opzione | Beneficio possibile | Costo/rischio | Decisione proposta |
| --- | --- | --- | --- |
| Vanilla TypeScript | Contratti, refactoring e lifecycle più sicuri, senza runtime UI aggiuntivo | Migrazione graduale e tooling dei test da adattare | Prima scelta per sito pubblico |
| JS + JSDoc/checkJs | Tipizzazione progressiva, diff piccoli | Annotazioni meno ergonomiche su modelli complessi | Primo gradino possibile |
| Svelte 5 island | Stato/form admin più leggibili e componenti riusabili | Runtime e hydration, migrazione dei form/upload | Pilota singola sezione admin |
| Preact island | JSX con runtime contenuto | Compat React non universale; nessun vantaggio automatico sui canvas | Alternativa se si preferisce JSX |
| Solid island | Aggiornamenti reattivi granulari | Nuovo modello mentale, ecosistema da verificare per widget richiesti | Alternativa al pilota, non insieme a Svelte |
| React island | Ampio ecosistema di editor e componenti | Runtime/hydration e complessità non necessari per le animazioni esistenti | Solo con una necessità concreta nell'admin |
| Vue island | UI dichiarativa e tool maturi | Altro runtime e riscrittura, nessun beneficio dimostrato qui | Valida se è lo stack del team |
| Web Components | Confini e lifecycle nativi senza framework UI | Stato complesso e form restano responsabilità nostra; shadow DOM può complicare CSS/GSAP | Valutare light DOM per widget indipendenti |
| Qwik/resumability | Riduzione hydration per certe applicazioni | Integrazione e migrazione da validare; non risolve costo GPU/GSAP | Non prioritario |
| Web Worker / OffscreenCanvas | Spostamento di calcolo dal main thread | Messaggi, input, resize, contesto GPU, compatibilità e fallback | Solo se un profilo mostra collo di bottiglia CPU |
| WebGPU / Rust-WASM | Kernel numerici e pipeline avanzate | Portabilità, doppio renderer, avvio e toolchain; non accelera automaticamente il DOM | Laboratorio eventuale, non base produzione |
| CSS/WAAPI nativi | Meno JS per animazioni semplici | Supporto e fedeltà della coreografia da provare | Valutare transizioni semplici; mantenere GSAP per sequenze complesse |
| Tailwind/CSS-in-JS | Convenzioni o ergonomia | Riscrittura senza beneficio runtime dimostrato | Non cambiare CSS per motivi di moda |

Non combinare più framework nel medesimo pilota. Un'isola è utile dove c'è stato interattivo da gestire; non serve a rendere più veloce una pagina già statica. `client:visible` può rinviare widget sotto la piega, ma il caricamento tardivo non deve far saltare una sequenza scroll. L'admin richiede interazione pronta e può usare un'isola dedicata senza portarne il runtime nelle pagine pubbliche.

## Varianti Rocket da confrontare (non implementate)

### R1 — Lean, raccomandata per iniziare

Astro 6.3.2 come controllo, Node 24 LTS per benchmark ripetibili, TypeScript progressivo, import dinamici e lifecycle esplicito. Nessuna modifica estetica. Primo obiettivo: differire il chunk Three sulle pagine non-home senza ritardare il menu. Potenziale byte differibili: il chunk attuale; risparmio effettivo da misurare dopo la separazione.

### R2 — Astro Next

Astro 7.2.x stabile con patch bloccata nel lockfile, stesso codice applicativo e stesso benchmark. Niente flag incrementali inizialmente. Confronto contro R1: build fredda/calda, output HTML/CSS, dimensioni, compatibilità Worker e regressioni visive. Non modificare contemporaneamente framework UI e compilatore.

### R3 — Admin Island

Su base vincente R1/R2, riscrivere solo una sezione editor evento in Svelte 5 + TypeScript. Alternativa separata Preact, non installazione simultanea. Le guide correnti riportano @astrojs/svelte 9.0.1, @astrojs/preact 6.0.5, @astrojs/solid-js 7.0.2 e @astrojs/react 6.0.5: sono candidati documentati, NON una matrice già validata con Astro 6. Le peerDependencies e le patch vanno verificate al momento del prototipo. Non installare indiscriminatamente `latest`.

### R4 — Navigation Lab

Confrontare MPA ottimizzata con Astro ClientRouter, soltanto dopo mount/destroy affidabili. Conservare l'effetto a quadratini, navigazione back/forward, focus, scroll restoration e aggiornamenti admin. Valutare prima la sovrapposizione tra richiesta della destinazione e animazione di copertura, senza aumentare complessità o mostrare dati obsoleti.

### R5 — GPU Lab, condizionale

Solo dopo tracce su dispositivi reali: confronto main-thread e worker per una singola pipeline canvas. Riduzione CPU non significa riduzione GPU; gli shader touch sono già sulla GPU. WASM/WebGPU ammessi solo con miglioramento ripetibile e fallback di qualità equivalente.

## Protocollo di prova necessario

Questa fase ha misurato build, test, file e dipendenze. NON sono stati misurati LCP/INP/CLS, frame time, memoria, TTFB pubblico o benefici delle varianti; nessun confronto reale tra framework è stato eseguito. I 360 test non sono 360 prove prestazionali su browser.

1. Stessi contenuti, stesso dispositivo/rete, build produzione e cache fredda/calda distinte. Almeno 5 ripetizioni; riportare mediana e p95 dove il campione è adeguato, senza attribuire significato statistico a pochi dati.
2. Percorsi: ingresso home, primo scroll/inversione rapida, pie/zoom, touch+rilascio, menu ripetuto, footer→evento→dettaglio→indietro, archivio galleria, admin upload/salvataggio e sync locale.
3. Browser: Chromium, Firefox e WebKit in laboratorio; iPhone Safari/Chrome/Edge e Android Chrome su hardware reale, tablet portrait/landscape e desktop. Emulazione viewport non equivale a GPU e input nativi del telefono.
4. Misure: byte JS/CSS per rotta e catena critica, parsing/esecuzione, long tasks, latenza interazioni, frame p95 e frame persi, memoria dopo navigazioni ripetute, richieste duplicate, API/TTFB, visibilità aggiornamenti admin.
5. Obiettivi proposti, non risultati: LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1 al p75 in campo; evitare lavoro continuo a pagina inattiva; nessuna crescita persistente dei listener/canvas dopo cicli di navigazione. Budget locali da tarare sulla prima traccia hardware.
6. Ogni esperimento deve superare test, confronto visuale e controlli su CSP, auth, upload, sincronizzazione e freschezza. Stop se il guadagno è marginale o aumenta il rischio di regressione. Un commit isolato per esperimento; nessun merge/pubblicazione senza decisione successiva.

## Fonti primarie consultate

- [Astro 6](https://astro.build/blog/astro-6/)
- [Astro 7](https://astro.build/blog/astro-7/) e [guida upgrade](https://docs.astro.build/en/guides/upgrade-to/v7/)
- [Astro 7.2](https://astro.build/blog/astro-720/)
- [TypeScript in Astro](https://docs.astro.build/en/guides/typescript/) e [tipi e runtime](https://www.typescriptlang.org/docs/handbook/2/classes)
- [Islands](https://docs.astro.build/en/concepts/islands/) e [script senza framework](https://docs.astro.build/en/guides/client-side-scripts/)
- [ClientRouter e lifecycle](https://docs.astro.build/en/guides/view-transitions/)
- [Svelte](https://docs.astro.build/en/guides/integrations-guide/svelte/), [Preact](https://docs.astro.build/en/guides/integrations-guide/preact/), [Solid](https://docs.astro.build/en/guides/integrations-guide/solid-js/), [React](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Server islands](https://docs.astro.build/en/guides/server-islands/), [immagini](https://docs.astro.build/en/guides/images/)
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas), [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [Release Node](https://nodejs.org/en/about/previous-releases)
