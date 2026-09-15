# Compatibilità browser — revisione 15 settembre 2026

Ambito: sito pubblico e anteprima colori, branch locale `finalRev`. Le prove descritte usano il browser integrato di Codex su desktop e fixture locali. Non costituiscono una certificazione di Safari, Chrome Android/iOS o hardware mobile.

## Versioni e capacità effettive

Lockfile verificato: Astro **6.3.2**, Vite **7.3.2**, GSAP **3.15.0**, Lenis **1.3.15**, Three.js **0.182.0**, Sharp **0.34.5**, Drizzle **0.44.7**. Nessun aggiornamento dipendenze in questa revisione; l'audit di sicurezza è separato.

Il client Astro imposta esplicitamente `build.target: "esnext"` in `node_modules/astro/dist/core/build/static-build.js`. La configurazione del progetto non lo sovrascrive tramite hook. I default browser di Vite non sono quindi una garanzia applicabile a questo output. Non è stato aggiunto un target storico senza prove su quei motori: la build valida l'output attuale, non certifica la sintassi per browser obsoleti.

Capacità usate: moduli ES, Promise, fetch, URL, Intl, `Object.hasOwn`, `Array.at`, ResizeObserver, IntersectionObserver, CSS custom properties, flex/grid, `svh`/`dvh`, safe-area, maschere SVG/CSS, `clip-path: path()`, `inert`, Canvas2D e WebGL. Three r182 richiede **WebGL2**; il marchio particellare usa direttamente WebGL1. La presenza dell'API non garantisce che GPU/driver/policy consentano di creare il contesto. [Three WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

La selezione del reveal Apple continua a verificare `animation-timeline` **e** `animation-range` con `CSS.supports`. Senza entrambe usa il percorso GSAP normalizzato già presente; gli altri dispositivi conservano il percorso corrente. Safari 26 introduce le animazioni guidate dallo scroll, ma il numero di versione non sostituisce questa verifica. [WebKit Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [GSAP normalizeScroll](https://gsap.com/docs/v3/Plugins/ScrollTrigger/static.normalizeScroll()/).

| Famiglia da verificare | Motore/percorso da distinguere | Stato di questa revisione |
| --- | --- | --- |
| Safari macOS/iOS/iPadOS | WebKit; iPad può usare una UA desktop | Policy Apple coperta da test; nessun nuovo test fisico Safari |
| Chrome desktop/Android | Chromium/Blink; touch e GPU restano variabili | Percorso ordinario conservato; non attribuire il browser Codex a una versione Chrome |
| Chrome iOS | Verificare build e motore effettivi; policy Apple include CriOS | Nessun nuovo test fisico iOS |
| Edge desktop/Android | Chromium, con impostazioni e politiche proprie | Compatibilità per capacità; esecuzione dedicata non svolta |
| Firefox desktop/Android | Gecko; non presupporre supporto delle timeline native | Ramo standard/GSAP; esecuzione dedicata non svolta |
| Samsung Internet | Versione Chromium distinta dalla versione Samsung | Non riusare i numeri di versione Chrome come minimi Samsung |
| Brave desktop/Android, iOS | Chromium sui primi, WebKit su iOS; Shields può limitare capacità | Storage/GPU negati simulati, nessuna prova dedicata Brave |
| Opera | Chromium nella versione ordinaria; Mini e modalità proxy sono un caso separato | Nessuna equivalenza promessa con Opera Mini |
| Browser incorporati/WebView | Versione fornita dall'app/OS, storage e GPU eventualmente limitati | Fallback simulati nel browser Codex; nessuna copertura di tutte le app ospitanti |

Fonti per le distinzioni delle famiglie: [Samsung UA e versione del motore](https://developer.samsung.com/internet/user-agent-string-format.html), [Brave e motori per piattaforma](https://brave.com/about/), [Opera e Chromium](https://www.opera.com/secure-private-browser), [Microsoft Edge](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-supported-operating-systems). Nessuna di queste fonti prova che il sito sia stato eseguito su quei browser.

## Difetti riprodotti e correzioni

- **Storage negato:** `getItem` interrompeva il preloader e l'inizializzazione delle transizioni; `setItem` dopo `preventDefault` poteva bloccare il cambio pagina. Le letture/scritture sono ora facoltative. Il preloader risolve anche quando i blocchi mancano; `pageshow.persisted` ripristina griglia trasparente e navigazione. I click modificati e i link download/nuova scheda conservano il comportamento nativo. Il browser può negare anche l'accesso a sessionStorage. [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).
- **GPU assente/persa:** il renderer skyline non può più interrompere la valutazione del modulo home. Grana CSS e immagine originale del marchio restano presenti; quest'ultima usa il filtro dell'inchiostro del tema. Menu e anello conservano firma TR, colori e link. La perdita di contesto ferma le rispettive richieste di frame; il fallback resta fino al caricamento successivo. Il marchio controlla anche compilazione/link degli shader e caricamento immagine. Non si assume che il ripristino del contesto recuperi automaticamente le risorse. [MDN perdita contesto](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost).
- **Motion ridotta:** al caricamento il sito evita smooth scroll, flicker di ingresso/menu, hero animato, shader decorativi, pie con pin/zoom, distorsione galleria, parallax footer e ripetizioni infinite dei contatti. Testi, marchio, titolo della pie, elenco e navigazione restano leggibili. La preferenza standard conserva shader, clock dell'animazione, reveal e suoni. Le scelte di inizializzazione richiedono un nuovo caricamento se la preferenza di sistema cambia durante la visita; alcune regole CSS rispondono subito. [GSAP e preferenze di movimento](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/).
- **Tastiera:** controlli nativi button, etichette, `aria-expanded`, dialog, overlay inizialmente inert/aria-hidden, focus sul tasto di chiusura, Tab/Shift+Tab circolari, Escape e ritorno al controllo originario. Il contenuto dietro il menu è inert durante l'apertura e recupera il proprio stato precedente. Sono presenti indicatori focus visibili. `inert` è una capacità richiesta dai browser moderni, non un polyfill per motori anteriori al suo supporto. [MDN inert](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/inert).
- **Contrasto tema:** l'avviso nero/blu riguardava il testo della pie, non i link del menu. L'editor ora distingue testo sagoma/accento, link menu/accento e link menu/inchiostro; anteprime e descrizioni esplicitano anche i due stati del pulsante sopra superfici chiare/scure. Gli estremi del colore dell'atmosfera non certificano tutti i fotogrammi intermedi; l'avvertenza lo dichiara.

## Layout: evidenza, non occultamento dell'overflow

Fixture solo in RAM, servita da proxy loopback; nessun contenuto D1/R2/snapshot modificato. `fixture-text-scale` imposta il font radice al 200%: **ridimensionamento testo**, non zoom reale del browser.

| Caso | Prima | Dopo |
| --- | --- | --- |
| Contatti, email lunga, 320×568 | Larghezza interna 358 su 320; email tagliata sui due lati dall'overflow hidden | Testo può spezzarsi; nessun taglio richiesto per contenerlo |
| Contatti, 844×390 | Righe y7–383 sotto nav e controllo menu | Altezza minima, contenuto libero di crescere e padding di sicurezza |
| Contatti, 390×844, font 200% | Larghezza interna 591 su 390 | 390/390, altezza 1256; email intera su più righe |
| Dettaglio, 390×844, font 200% | Root 449, seconda colonna oltre il bordo a x449 | Root 390; colonne vanno a capo, x64–326 |
| Home, testo lungo, 320×568 | Nessun difetto persistente: paragrafi 256/256, sezione cresce a 4005 | Nessun irrigidimento aggiunto alla sezione |

Le correzioni usano `min-width:0`, `overflow-wrap:anywhere`, flex wrap, altezza minima e padding safe-area. Il logo decorativo mantiene le dimensioni normali, con limite indipendente dall'ingrandimento del testo; la nav riserva spazio centrale e può andare su più righe. Nessun overflow hidden aggiunto alla root. [MDN overflow-wrap](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap).

## Verifiche e limiti

Suite Node finale: **332/332**; nuove regressioni browser: **19**. Coprono storage negato, navigazione/back-forward, WebGL mancante/perso e shader fallito, identità visibile, menu focus/semantica, motion ridotta e contrasti. La pulizia GPU avviene su `pagehide` non persistito: un ingresso nella back-forward cache conserva risorse e osservatori per il ritorno. Le precedenti prove di timing mobile e policy Apple restano verdi. Build locale: **13 pagine**, exit 0. I test degli artifact leggono `dist`: eseguirli dopo la build, non contemporaneamente alla sua rigenerazione.

Il controller ha verificato nel browser disponibile home/menu/eventi, palette alternativa (`#f0e8d0`, `#182027`, `#ad286b`), grana, atmosfera TR, anello, icone e pie. Bozza admin conservata dopo cambio tab e salvataggio solo nella fixture RAM. Con failure injection WebGL+storage negati il loader termina e la navigazione a Eventi riesce anche con motion ordinaria. Three può stampare la diagnostica attesa di creazione contesto fallita: viene gestita e non implica che la pagina sia bloccata. Con movimento ridotto simulato sono visibili marchio/copy/TR, e la tastiera Enter/Tab/Shift+Tab/Escape funziona; l'albero accessibile esclude lo sfondo quando aperto e l'overlay quando chiuso.

Matrice finale verificata dal controller sul codice modificato: **320×568, 390×844, 768×1024, 820×1180, 1024×768, 1180×820, 1440×900, 2560×1080**. Home ed Eventi hanno root/client width uguali in tutti gli otto casi; anche l'hero home rispetta la larghezza. Menu a 320×568 e 820×1180: TR animato, quattro etichette e icone leggibili, anello entro viewport; controllo compatto 176×48 a 320/390. Enter su Eventi apre la pagina con tre schede. Dalla scheda reale al dettaglio `/eventi/giornata-tutto-rifiuto`, a 390×844: hero caricato a 1600px, tre immagini galleria a 1400px, tutte visibili dopo scroll senza sparizione nera. Viewport landscape/portrait non equivalgono a prove su iPhone/iPad/Android. Versione esatta del motore Codex non esposta nella sessione; non dedotta dalla piattaforma.

Restano da eseguire fuori da questa sessione: dispositivi fisici con toolbar dinamiche/rotazione/safe-area, zoom nativo browser, lettore di schermo reale, GPU/driver diversi e ciascuna famiglia sopra elencata. Il supporto alla disattivazione completa di JavaScript e a browser obsoleti privi delle API elencate non è stato aggiunto. Nessuna dichiarazione di compatibilità universale o di conformità WCAG completa.
