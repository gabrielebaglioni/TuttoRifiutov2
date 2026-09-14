# Tutto Rifiuto

Sito Astro con contenuti pubblici statici di fallback, Worker Cloudflare, pannello editoriale privato, D1 per i dati e R2 per i media ottimizzati.

## Sorgente e pubblicazione

Repository: https://github.com/gabrielebaglioni/TuttoRifiutov2

Sito: https://tutto-rifiuto.gabrielebaglioni55.chatgpt.site

Questa repository contiene il codice completo. Sites mantiene una repository separata per le versioni pubblicate: un push su GitHub non esegue automaticamente un deploy. Per pubblicare modifiche al codice occorre sincronizzare il sorgente con Sites, costruire e salvare una versione e distribuirla. Gli aggiornamenti editoriali dall’admin sono invece immediati e non richiedono build.

L’accesso pubblico del sito è indipendente dall’autenticazione dell’admin. Le credenziali di amministrazione e i token di pubblicazione non devono essere inseriti su GitHub.

## Pannello editoriale

Il pannello è disponibile su `/admin`. Da qui l’amministratore può aggiornare e ripristinare tutti i testi del sito, gestire Eventi e Archivio, sostituire copertine e immagini di dettaglio e riordinare i media. Gli aggiornamenti vengono letti dalle API pubbliche e diventano visibili senza commit o nuova build.

Il browser accetta JPEG, PNG, WebP e AVIF e converte ogni caricamento in un massimo di tre varianti WebP, con larghezze obiettivo di 640, 1280 e 2048 pixel. Non viene mai eseguito un ingrandimento: per immagini più piccole viene conservata come limite la larghezza sorgente. Il rapporto tra i lati viene mantenuto e l’orientamento incorporato viene applicato quando il browser lo supporta.

Il server accetta al massimo tre varianti, fino a 2,5 MB e 25 milioni di pixel ciascuna, entro una richiesta complessiva di 8 MB. L’originale pesante non viene inviato né conservato. La capacità di elaborare il file iniziale dipende comunque dalla memoria disponibile nel browser; un errore lascia pubblicata l’immagine precedente.

Le immagini incluse nel codice sono placeholder di sicurezza. Se un contenuto API o un media remoto non è disponibile, il sito continua a mostrare il fallback locale. Le sole varianti ottimizzate vengono salvate in R2: i caricamenti futuri non entrano nel repository e non rallentano né richiedono una nuova build.

## Configurazione runtime

Copiare `.env.example` soltanto per lo sviluppo locale e configurare questi valori tramite i segreti runtime dell’ambiente di hosting:

```dotenv
ADMIN_USERNAME=
ADMIN_PASSWORD=
SESSION_SECRET=
```

Non inserire valori reali in file versionati, bundle client, configurazione di hosting o comandi conservati nella cronologia. `SESSION_SECRET` deve essere casuale e avere entropia adeguata (almeno 32 byte). In caso di rotazione, aggiornare la password e generare un nuovo segreto di sessione; il cambio del segreto invalida immediatamente i cookie precedenti.

La configurazione Sites in `.openai/hosting.json` dichiara soltanto il progetto e i binding logici `DB` (D1) e `MEDIA` (R2). Le risorse effettive e i segreti vengono associati durante il deploy privato.

## Database e build

Le migrazioni D1 sono versionate in `drizzle/`, compresi journal e snapshot. Quando lo schema cambia:

```sh
npm run db:generate
```

Controllare sempre la nuova migrazione prima del deploy. La build copia l’intera catena corrente in `dist/.openai/drizzle/`, insieme alla configurazione di hosting, così Sites può applicarla al database associato.

Per verificare e costruire l’artefatto:

```sh
npm test
npm run build
npm test
```

Il pacchetto contiene gli asset del sito, il Worker, `/admin`, i metadata Sites e l’intera catena di migrazioni; non contiene segreti runtime, originali caricati dall’utente o source map. Le API di modifica e il pannello editoriale restano protetti anche quando il sito è pubblico.
