# Tutto Rifiuto — Admin CMS e API

## Obiettivo

Trasformare il sito Astro esistente in un sito editorialmente gestibile senza cambiare identità visiva, layout, animazioni o struttura pubblica. Un pannello privato su `/admin` deve permettere di modificare tutti i testi del sito e tutte le immagini di Archivio ed Eventi. Gli aggiornamenti devono diventare visibili senza ricompilare il sito e senza aggiungere media al repository.

Il progetto originale in `/Users/gabrielebaglioni/codeGrid/CGMWTJAN2026/TuttoRifiuto` resta intatto. Ogni intervento riguarda esclusivamente la copia Sites.

## Architettura

La copia Sites mantiene Astro per le pagine, gli stili e le animazioni esistenti. Il Worker che oggi serve gli asset statici viene esteso con API HTTP per contenuti, autenticazione e immagini.

- D1 conserva contenuti strutturati, sessioni e riferimenti alle immagini.
- R2 conserva esclusivamente le varianti web ottimizzate delle immagini caricate dall’admin.
- Le pagine pubbliche caricano i contenuti correnti dalle API e usano i contenuti presenti nel codice come fallback.
- `/admin` è una pagina dedicata che consuma le API private.
- Nessuna modifica editoriale futura scrive nel repository o avvia una nuova build.

Le unità restano separate:

1. `auth`: login, logout, sessione e protezione CSRF.
2. `content`: lettura e scrittura dei testi globali e delle singole pagine.
3. `events`: gestione dei record evento e delle relative gallerie.
4. `archive`: gestione dei record dell’archivio e delle relative gallerie.
5. `media`: validazione, caricamento, distribuzione e rimozione delle varianti ottimizzate.
6. `admin`: interfaccia editoriale che orchestra le API senza contenere segreti.

## Autenticazione e sicurezza

Il pannello usa il nome utente `Frank`. La password fornita dall’utente viene configurata esclusivamente come segreto runtime; non viene riportata nella specifica, salvata nel repository, inclusa nei bundle client o inserita nel database. Un ulteriore segreto casuale firma le sessioni.

Il login crea una sessione server-side a durata limitata e un cookie `HttpOnly`, `Secure` e `SameSite=Strict`. Le operazioni di scrittura richiedono sia la sessione sia un token CSRF. Login e scritture applicano un limite di frequenza. Le risposte non devono distinguere tra nome utente inesistente e password errata.

Il percorso `/admin` può essere raggiunto come URL, ma i suoi dati e le funzioni editoriali non vengono restituiti senza una sessione valida. Gli endpoint pubblici espongono soltanto contenuti pubblicati; gli endpoint di modifica, caricamento e ripristino sono privati.

## Modello dei contenuti

### Contenuti globali e pagine

Una tabella `content_entries` conserva valori identificati da chiavi stabili. Le chiavi sono raggruppate per:

- Home: hero, presentazione, transizione, sezione “Come funziona” e testi introduttivi.
- Work/Archivio: intestazioni, descrizioni e testi delle schede.
- Progetto: hero, descrizioni, informazioni e testi conclusivi.
- Contatti: titoli, descrizioni, etichette e collegamenti.
- Globali: menu, footer, etichette ricorrenti e metadati SEO/social.

Ogni record contiene chiave, valore JSON, stato di pubblicazione e data di aggiornamento. Il codice esistente costituisce il valore predefinito e il fallback. Il comando “Ripristina” elimina l’override oppure ripristina esplicitamente il valore iniziale.

### Eventi

La tabella `events` conserva slug stabile, stato, titolo, riepilogo, descrizione, metadati, informazioni, testo conclusivo, SEO e ordinamento. Una tabella `event_media` collega a ciascun evento una copertina e zero o più immagini di dettaglio, con testo alternativo e ordine.

### Archivio

La tabella `archive_items` conserva slug stabile, titolo, descrizione, metadati, testo conclusivo, SEO e ordinamento. Una tabella `archive_media` collega copertina e immagini di dettaglio, con testo alternativo e ordine.

## API

Le API pubbliche sono in sola lettura:

- `GET /api/content`
- `GET /api/events`
- `GET /api/events/:slug`
- `GET /api/archive`
- `GET /api/archive/:slug`
- `GET /media/:key`

Le API private richiedono sessione e CSRF:

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/session`
- `PUT /api/admin/content/:key`
- `DELETE /api/admin/content/:key`
- `POST|PUT|DELETE /api/admin/events/...`
- `POST|PUT|DELETE /api/admin/archive/...`
- `POST /api/admin/media`
- `DELETE /api/admin/media/:id`

Le API restituiscono JSON con errori stabili e leggibili. Gli aggiornamenti di contenuto usano transazioni quando coinvolgono più record.

## Pannello `/admin`

La schermata iniziale mostra soltanto il login. Dopo l’accesso, il pannello presenta una navigazione laterale o a tab con Home, Archivio, Eventi, Progetto, Contatti e Globali.

I moduli riflettono i campi reali del sito. Ogni sezione supporta salvataggio, annullamento delle modifiche locali e ripristino del placeholder. Le raccolte supportano riordinamento; ogni immagine mostra anteprima, testo alternativo, ruolo e stato di caricamento. Il pannello segnala chiaramente modifiche non salvate, operazioni riuscite ed errori.

La prima versione mantiene un solo ruolo amministratore. Non sono previsti registrazione pubblica, gestione utenti, workflow di approvazione o cronologia completa delle revisioni.

## Pipeline delle immagini

Le immagini attuali sono placeholder e restano nel codice come fallback. Prima della prossima pubblicazione, le immagini sorgente della copia Sites vengono ottimizzate senza modificare il progetto originale e senza cambiamenti visibili.

Per i caricamenti futuri, il pannello:

1. decodifica localmente JPEG, PNG, WebP o AVIF;
2. corregge l’orientamento leggibile dal browser;
3. produce varianti WebP piccola, media e grande rispettando le proporzioni;
4. comprime con qualità adatta alle fotografie e preserva la trasparenza quando presente;
5. invia soltanto le varianti ottimizzate all’API;
6. aggiorna il record D1 soltanto dopo che tutti gli oggetti R2 necessari sono stati salvati.

L’originale pesante non viene conservato. Il server verifica tipo dichiarato, firma del file, dimensioni finali, numero di varianti e autorizzazione. Un caricamento fallito non sostituisce l’immagine pubblicata. La rimozione di un media elimina prima il riferimento editoriale e poi gli oggetti non più usati.

Non è possibile garantire file di dimensione infinita: l’elaborazione dipende dalla memoria del browser. Se un file non può essere decodificato o ottimizzato, il pannello restituisce un errore esplicito e lascia invariato il contenuto pubblicato.

## Flusso pubblico e fallback

Al caricamento di una pagina, il sito richiede i contenuti pubblicati. Se l’API non risponde o un record non esiste, la pagina usa immediatamente il contenuto predefinito incluso nel codice. Le immagini usano `srcset` e `sizes` per scegliere la variante adatta; se una variante remota non è disponibile, viene mostrato il placeholder locale.

Il caricamento dinamico non deve bloccare animazioni o navigazione. I componenti espongono stati iniziali completi e sostituiscono soltanto i campi ricevuti e validi.

## Errori e consistenza

- Le scritture non autenticate restituiscono `401`; le sessioni valide senza CSRF restituiscono `403`.
- Payload o file non validi restituiscono `400` con un codice errore stabile.
- Slug duplicati restituiscono `409`.
- Errori D1/R2 restituiscono `500` senza dettagli sensibili.
- Un aggiornamento media non modifica D1 finché tutte le varianti non risultano salvate.
- Il contenuto precedente resta pubblico in caso di errore.
- I segreti non compaiono nei log.

## Migrazione iniziale

Una migrazione D1 crea le tabelle e inserisce i record iniziali derivati dai dati correnti. I placeholder rimangono nel bundle come fallback, ma non vengono duplicati in R2. La configurazione Sites dichiara un binding D1 e un binding R2 logici; le risorse effettive vengono gestite da Sites.

## Verifica

La verifica comprende:

- test unitari per password, sessione, CSRF, validazione payload e policy media;
- test delle API pubbliche e private con D1/R2 locali;
- test di modifica, ripristino e fallback per ogni gruppo di contenuti;
- test della pipeline immagini e del comportamento atomico in caso di errore;
- controllo che nessun segreto sia incluso nel bundle o nel repository;
- build completa e controllo delle route pubbliche e `/admin`;
- smoke test di login, modifica testo, caricamento copertina, caricamento dettagli, logout e accesso negato;
- verifica che gli aggiornamenti editoriali non richiedano una nuova build.

## Criteri di accettazione

1. Il sito pubblico conserva l’aspetto e le animazioni esistenti.
2. `Frank` può accedere a `/admin` con la password configurata nel runtime.
3. Un visitatore non autenticato non può leggere o modificare dati amministrativi.
4. Tutti i testi del sito sono modificabili e ripristinabili dall’admin.
5. Copertine e dettagli di Eventi e Archivio sono sostituibili e riordinabili.
6. I caricamenti producono e conservano soltanto varianti web ottimizzate.
7. I contenuti aggiornati diventano pubblici senza commit, push o nuova build.
8. Un errore di API o media lascia visibili i placeholder o l’ultima versione valida.
9. Il progetto originale resta invariato.
