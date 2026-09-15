# Final Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralizzare tutti i colori editoriali e prepararne la gestione admin, quindi verificare compatibilità, layout e sicurezza senza alterare il design iniziale.

**Architecture:** Registro tema condiviso e palette CMS atomica con CSS custom properties e adattatori shader. Mantenere l'architettura Astro/Worker e il sistema di snapshot attuale. Correzioni prestazioni guidate da capacità reali e regressioni riprodotte.

**Tech Stack:** Astro 6.3.2, GSAP 3.15.0, Lenis 1.3.15, Three.js 0.182.0, Worker D1/R2, node:test/linkedom.

**Spec:** docs/superpowers/specs/2026-09-15-final-revision-design.md

## Global Constraints
- Lavorare su finalRev; checkpoint main c81f2e7 intatto; niente push GitHub, merge o modifica credenziali.
- Preservare design, default, animazioni e percorso Chrome funzionante; nessun cambiamento a dati live per i test.
- Colori collegati per ruolo, palette atomica e validata; niente CSS/URL liberi; fotografie e maschere tecniche escluse dai colori editoriali.
- Nessuna nuova dipendenza runtime per il tema. Riutilizzare autenticazione, CSRF, bozze e snapshot.
- Riferire solo test realmente eseguiti, senza garanzia universale di assenza di regressioni.

### Task 1: Sistema colori completo e admin
**Files:** creare `src/data/theme.js`, `src/scripts/theme.js`, `src/scripts/admin-theme.js`, `tests/theme.test.mjs`; modificare `src/data/site-content.js`, `worker/validation.js`, `worker/router.js`, `src/layouts/BaseLayout.astro`, `src/pages/admin.astro`, `src/scripts/admin.js`, `src/scripts/content-hydration.js`, consumatori CSS/Canvas/WebGL in `src/styles/` e `src/scripts/` e test pertinenti.
**Interfaces:** `THEME_KEY = 'global.theme.palette'`; `DEFAULT_PALETTE`; `validatePalette(value)`; `themeCss(value)` producono un solo oggetto tema validato e stringa CSS sicura; definire esplicitamente token, etichette italiane e utilizzi nel registro. È consentito un oggetto CMS con schema specifico per questa chiave. Il salvataggio usa l'endpoint contenuti esistente, non endpoint separati per token.
- [ ] Scrivere test RED per validazione completa: `assert.equal(validatePalette({...DEFAULT_PALETTE, foreground:'url(https://evil.test)'}),false)`; palette incompleta/sconosciuta/prototipi e CSS injection rifiutati; default valido e ruoli invertiti derivati dallo stesso token.
- [ ] Eseguire `node --test tests/theme.test.mjs` e registrare l'errore atteso.
- [ ] Implementare registro, schema specifico worker, tema HTML iniziale e aggiornamento pubblico: una sola lettura delle custom properties per aggiornamento tema, non per frame. Usare `style.setProperty` solo con chiavi fisse e colori esadecimali validati. Portare colori degli shader a uniform senza cambiare la geometria. Maschere bianco/nero/alpha rimangono tecniche. Gestire ridisegno canvas quando cambia il tema.
- [ ] Integrare tab Colori admin, color picker e valori hex leggibili, collegamenti/utilizzi, anteprima, reset, avvisi contrasto. Riutilizzare il resource/draft/busy lifecycle del CMS; non perdere modifiche su tab switch o richiesta in corso. Tema admin separato e protetto da palette pubblica illeggibile.
- [ ] Aggiungere test di integrazione controller/worker: salvataggio atomicamente completo con CSRF; invalidi respinti prima DB; reload HTML con nuovo tema; bozze/annulla/ripristino; colori CSS e shader ricevono stessi valori. Ricerca residui colore e documento delle esclusioni tecniche.
- [ ] Eseguire suite completa e build, self-review, commit task e report con evidenza RED/GREEN.

### Task 2: Compatibilità e layout
**Files:** consumatori motion in `src/scripts`, CSS pubblico `src/styles/site`, test `tests/browser-compatibility.test.mjs`, report `docs/reviews/browser-compatibility.md`.
**Interfaces:** consumare il registro tema completato nella task 1, non aggiungere colori hardcoded. Estendere le policy motion esistenti solo se evidenza richiede; non cambiare il percorso Chrome per browser branding.
- [ ] Inventariare versioni lockfile e feature usate. Consultare documentazione ufficiale di WebKit, GSAP, Three.js e compatibilità CSS. Elencare Safari/Chrome/Edge/Firefox/Samsung Internet/Brave/Opera e browser incorporati separando motore, capacità e dispositivi verificabili.
- [ ] Scrivere test RED per il difetto effettivamente trovato (WebGL assente/perdita contesto, testo nascosto senza animazione o overflow). Per WebGL negato l'asserzione è che contenuto e navigazione restino visibili, non soltanto che non venga lanciata un'eccezione.
- [ ] Implementare alternative leggere con identità visiva quando shader non disponibili, preferenze reduced-motion e guardie lifecycle. Non modificare animazioni funzionanti senza una prova che lo richiede.
- [ ] Revisionare larghezze, min-width, overflow, safe-area, orientamento, zoom, focus e testi lunghi. Applicare solo regole motivate; non nascondere overflow per coprire errori.
- [ ] Testare viewport 320/390/768/820/1024/1180/1440/2560 e navigazione principale con browser disponibile; documentare limiti su motori non disponibili. Eseguire test/build, commit e report.

### Task 3: Sicurezza e gate finale
**Files:** `docs/reviews/security_best_practices_report.md`, test e file direttamente interessati da problemi confermati in worker/auth/upload/rendering/sync.
**Interfaces:** schema tema e API precedenti sono superficie di audit. Non cambiare il contratto CMS o credenziali.
- [ ] Tracciare input→validazione→DB/DOM, auth e CSRF, limiti upload, CSP, segreti frontend e sync. Eseguire controllo dipendenze senza aggiornamenti automatici; classificare risultati con file/linea e verificare falsi positivi.
- [ ] Per problemi correggibili in scope scrivere test RED dell'abuso concreto, poi fix minimo e test GREEN. Non allentare CSP né alterare cookie di produzione per far passare prove locali.
- [ ] Rivedere duplicazioni correlate alle superfici toccate; evitare refactoring estetico globale.
- [ ] Eseguire suite completa, build, budget asset e verifica responsive finale. Consegnare report con rischi residui e checklist dominio/credenziali di lancio.
- [ ] Revisione indipendente finale dell'intero branch, correzioni e verifica. Pubblicare solo versione validata con normale workflow Sites; lasciare main intatto e GitHub manuale.
