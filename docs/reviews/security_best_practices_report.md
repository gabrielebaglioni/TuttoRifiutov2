# Revisione sicurezza — 15 settembre 2026

## Sintesi

Corretti due problemi riprodotti con test: elaborazione nativa di file remoti prima della verifica WebP e accesso anonimo alle immagini di eventi in bozza/elementi in eliminazione. Nessuna modifica a credenziali, dati pubblicati o schema D1. Non è una certificazione di sicurezza universale: restano aggiornamenti delle dipendenze e verifiche operative prima del lancio con dominio.

## Problemi corretti

### SEC-01 — Alto, impatto locale condizionato: decoder immagini

`scripts/local-content-sync.mjs:92`: i byte scaricati passano ora nel parser strutturale WebP condiviso (`worker/media.js:72`) prima di Sharp. Firma, lunghezza RIFF, struttura statica e limite pixel sono verificati senza decoder nativi; resta il controllo metadata successivo. Test con formato estraneo e RIFF malformato confermano zero chiamate al decoder. Il WebP valido di piccole dimensioni continua a essere copiato correttamente. Conflitti, staging, backup e origine HTTPS fissa restano invariati.

Il rischio originale richiedeva controllo dei byte restituiti dal sito fidato: non era un endpoint pubblico di esecuzione nativa nel Worker. Il preflight restringe la superficie, **non aggiorna le librerie vulnerabili** e non prova innocui tutti i possibili WebP malformati.

### SEC-02 — Medio: visibilità delle immagini

`worker/media.js:162`: il server verifica stato e cancellazione del proprietario prima di leggere R2. Gli eventi non pubblici richiedono la sessione admin reale; assenza/scadenza della sessione restituisce 404. Gli elementi in eliminazione sono negati anche agli admin. L'archivio non ha un proprio stato bozza: si rispetta lo schema esistente, senza inventare colonne.

`worker/media.js:199`: anteprime `private, no-store`; risposte pubbliche `max-age=0, must-revalidate`, con `Vary: Cookie`. Un ETag valido produce 304 solo dopo aver ricontrollato visibilità e manifest, risparmiando il trasferimento immagine. I test SQLite riproducono entrambe le famiglie e il passaggio pubblico→bozza.

Limite: intestazioni nuove non revocano copie già scaricate né vecchie copie con cache annuale. Non è stato eseguito alcun purge live. Un contenuto precedentemente pubblico non può diventare retroattivamente segreto.

## Rischi residui e dipendenze

Audit npm di produzione del 15 settembre: **11 pacchetti segnalati: 1 critical, 9 high, 1 low**. Nessuna installazione o correzione automatica. È un conteggio degli advisory, non degli endpoint vulnerabili del sito.

| Pacchetto bloccato | Severità audit | Raggiungibilità osservata |
| --- | --- | --- |
| Astro 6.3.2 | Critical | Ottimizzazione AVIF non fidati nel build; il Worker pubblico è personalizzato, non Astro SSR/image server. Fix ufficiale 7.2.8: aggiornamento major da verificare separatamente. |
| Sharp 0.34.5 | High | Confine locale SEC-01 mitigato. Fix nativo completo 0.35.4; verificare anche eventuali copie annidate di Astro. |
| Drizzle ORM 0.44.7 | High | Advisory sugli identificatori SQL non fidati; Worker usa nomi da mapping chiusi e valori bind, non importa ORM. Fix 0.45.2. |
| devalue 5.8.0, js-yaml 4.1.1, smol-toml 1.6.1 | High | Parsing ostile/DoS: nessun relativo formato o decoder esposto dal Worker. Tooling/build rimangono da aggiornare. |
| nanoid 3.3.11 | High | Nessuna dimensione del generatore controllata da input runtime; sessioni Web Crypto e UUID. |
| PostCSS 8.5.10, SVGO 4.0.1 | High | CSS/SVG ostili nel processamento; CMS non accetta CSS libero o SVG caricati. Repository/build restano una superficie fidata. |
| Vite 7.3.2, esbuild 0.27.7 | High / Low | Advisory di server di sviluppo Windows; host verificato macOS, nessun dev server nel Worker distribuito. |

La classificazione della raggiungibilità è un'inferenza dall'architettura attuale, non una dichiarazione che i pacchetti siano aggiornati. Non introdurre repository/input di build non fidati. Pianificare un aggiornamento dedicato di Astro/Sharp con test visuali e build, evitando un cambio major improvvisato durante questa revisione.

Fonti: [Sharp/libvips](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj), [Sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [Astro AVIF](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2), [Drizzle](https://github.com/advisories/GHSA-gpj5-g38j-94v9).

## Protezioni conservate e CSP

- `worker/auth.js:28`: cookie HttpOnly/Secure/SameSite Strict, durata 8h, sessioni HMAC, CSRF sulle mutazioni. Login con body limitato, verifica a tempo costante e prenotazione atomica dei tentativi. Nessun segreto nel frontend aggiunto.
- `worker/handlers/media.js`: autenticazione prima dei caricamenti, multipart limitato, varianti WebP con dimensioni/rapporti verificati, chiavi canoniche e manifest del proprietario. Non si accettano HTML/SVG eseguibili come upload.
- `worker/validation.js`: chiavi editoriali allowlist; palette completa con soli hex validati, link con schemi ammessi. Nessun CSS o URL libero nei colori.
- `worker/router.js:142` e `astro.config.mjs:9`: header CSP più meta CSP compilata con SHA-512. La meta restringe gli script anche se l'header contiene unsafe-inline: le policy si intersecano. Verificati gli hash degli script inline compilati su home, contatti, eventi, archivio e admin. Nessuna rimozione indiscriminata di unsafe-inline, che romperebbe moduli e animazioni. [Semantica CSP multipla](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy#multiple_content_security_policies).
- La sicurezza script dipende anche dalla meta generata: mantenerne il controllo dopo future modifiche al build. Gli stili animati richiedono una revisione dedicata prima di restringere ulteriormente style-src.
- `worker/handlers/collections.js:97`: alcune letture JSON controllano i byte dopo request.text; è una limitazione di memoria autenticata residua, non una DoS anonima dimostrata. Riutilizzare in futuro il reader streaming esistente, senza allargare questo refactor.

## Checklist di lancio

- Impostare personalmente una password admin lunga/unica e un SESSION_SECRET casuale; le credenziali storiche non sono riportate né cambiate.
- Confermare dominio, DNS e HTTPS; coordinare URL canonici e origine del sincronizzatore quando si collega il nuovo dominio. La revisione finale ha allineato astro.config all'indirizzo Sites attuale verificato, eliminando il precedente host dai metadati compilati; nessun dominio o origine del sincronizzatore è stato cambiato.
- Usare un Node LTS supportato per sviluppo/build in una verifica separata; Node 23 locale e warning SQLite non descrivono il runtime Worker.
- Eseguire prove fisiche Safari/Edge/Chrome iOS, Android e tablet: il report browser distingue chiaramente simulazione e hardware realmente verificato.
- Il push GitHub resta manuale; la replica locale conserva i controlli contro sovrascritture. Nessun GitHub Actions aggiunto.

## Verifica di questa revisione

Build finale: 13 pagine, riuscita. Suite: 342/342 test superati; budget asset: 2/2. Test mirati sicurezza: 57/57, con prove RED prima delle correzioni. Restano warning SQLite sperimentale e diagnostiche generiche intenzionali dei test di errore storage. Controllo del Worker compilato sulle cinque pagine sopra: tutte 200, meta CSP presente, hash degli script inline coerenti, framing DENY. Nessun test ha scritto dati live.
