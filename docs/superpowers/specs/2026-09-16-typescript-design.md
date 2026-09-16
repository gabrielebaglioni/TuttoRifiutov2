# Migrazione completa TypeScript

## Base e obiettivo

Ramo: `codex/typescript`, creato da `main` a `89fb16b` dopo avere integrato
interamente `finalRev`. Baseline: 371 test passanti. Il sito pubblico non viene
modificato durante la migrazione. I contenuti aggiornati dall'utente restano inclusi.

Convertire il codice applicativo, Worker/API, strumenti e test a TypeScript con
controlli reali. Non cambiare stile, tempi delle animazioni, API, autenticazione,
salvataggi o sincronizzazione. Astro e Svelte mantengono i loro formati nativi,
con script TypeScript. Il JavaScript generato, le dipendenze e gli shader GLSL
non sono sorgenti da convertire.

## Scelta architetturale

Conservare Astro 7.2 e Svelte 5, senza introdurre un framework per le animazioni.
Preferire una migrazione per domini con checkpoint verificati alla semplice
rinomina dei file o a una riscrittura globale. La rinomina non garantisce tipi
corretti; la riscrittura aumenterebbe il rischio di regressioni grafiche.

Separare configurazioni di controllo per browser, Worker e strumenti Node:
ognuna deve conoscere solo le API del proprio ambiente. Obiettivo finale:
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`useUnknownInCatchVariables`, `noImplicitOverride`, nessun sorgente applicativo
JS escluso dal controllo. Controllare anche componenti Astro e Svelte.
Non introdurre `@ts-nocheck`, `@ts-ignore` o `any` per aggirare gli errori.

## Confini e tipi

- Modelli condivisi per contenuti, palette, eventi, archivio e media; mantenere
  la distinzione tra bozze, contenuti pubblicati e dati ricevuti dall'esterno.
- JSON, storage e risposte HTTP entrano come `unknown` e attraversano le
  validazioni esistenti, tipizzate e testate. I tipi non sostituiscono le
  verifiche runtime o quelle di sicurezza.
- Handler Worker con binding DB/MEDIA espliciti e risposte tipizzate; nessuna
  modifica a cookie, CSRF, limiti upload o permessi.
- DOM con query tipizzate e gestione dell'assenza degli elementi, non cast
  indiscriminati. Eventi custom documentati in una mappa comune.
- Import `type` per evitare inclusioni runtime; librerie pesanti ancora lazy;
  admin ancora separato dal bundle pubblico.

## Animazioni

Convertire prima le funzioni pure di progresso, viewport e gesti, poi i controller.
Rappresentare gli stati esclusivi con union discriminate dove eliminano realmente
combinazioni impossibili, senza astrarre inutilmente ogni variabile.
Tipizzare frame request, pointer ownership, riferimenti canvas/WebGL e callback.
Verificare rimozione listener, annullamento frame e teardown su navigazione.
Non rimuovere le guardie per reduced motion, touch, visibilità e resize iOS.

Conservare la pipeline CSS esbuild e il test della timeline nativa: un typecheck
non può rilevare la regressione del minificatore già risolta. Ottimizzazioni dei
frame o del rendering si accettano solo con misure prima/dopo e test dedicati.

## Sequenza e accettazione

1. Registrare baseline di build, bundle, controlli e percorso delle animazioni.
2. Migrare modelli e funzioni pure con test di input limite e contratti di tipo.
3. Migrare API/Worker e admin mantenendo i test di sicurezza e upload.
4. Migrare controller DOM, animazioni, navigazione e caricamenti selettivi.
5. Migrare strumenti e test; aggiornare runner e import senza duplicare sorgenti.
6. Rendere obbligatori tutti i controlli prima della build e verificare il pacchetto.

Ogni gruppo deve superare typecheck e test prima del successivo. Accettazione
finale: nessun JS applicativo residuo, nessuna soppressione degli errori,
test funzionali passanti, build riproducibile, bundle pubblico senza Svelte admin,
autenticazione/upload funzionanti, homepage e dettagli senza regressioni.

Matrice grafica: telefono 390x844, tablet 768x1024 e 1024x768, desktop 1440x900;
caricamento a scroll zero, scroll rapido avanti/indietro, fine zoom pie, gesture
oblique e verticali, menu, transizioni, immagini di dettaglio e reduced motion.
Registrare esplicitamente browser/dispositivi realmente provati e quelli non
disponibili: nessuna equivalenza presunta tra viewport emulata e iPhone reale.

## Fonti ufficiali

- https://www.typescriptlang.org/tsconfig/
- https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html
- https://v7-2.previews.docs.astro.build/en/reference/cli-reference/

## Checkpoint

Questo documento definisce il perimetro da approvare prima della conversione.
Merge e pubblicazione della migrazione avverranno solo dopo verifica e approvazione.
