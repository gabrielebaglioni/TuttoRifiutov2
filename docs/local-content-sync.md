# Contenuti online → repository locale

Il CMS pubblica in D1/R2; le pagine rileggono i dati al caricamento. Non è una pipeline CI/CD di codice: non richiede una build per ogni testo o immagine. Nessuna GitHub Action e nessun push automatico sono configurati.

Il LaunchAgent `it.tuttorifiuto.content-sync` esegue `npm run content:sync` (tramite Node diretto) ogni 60 secondi mentre l'utente è connesso al Mac. La prima esecuzione avviene all'accesso. Mac spento, logout, sospensione o rete assente ritardano la copia; alla ripresa il processo recupera lo stato pubblicato più recente, non ogni stato intermedio.

## Evidenza

- Admin → «Pubblicazione e copia locale» → «Verifica la versione online»: impronta SHA-256 del contenuto pubblico.
- `content/published/manifest.json`: stessa impronta `revision`, mappa degli URL delle immagini ottimizzate, file e hash.
- `.cms-sync/status.json`: ultimo controllo locale e risultato; questa cartella è ignorata da Git.
- `git diff` / `git status`: cambiamenti pronti per il tuo commit e push manuale.
- Comando manuale dalla repo: `npm run content:sync`.

## Sicurezza e limiti

Solo HTTPS in uscita verso l'origine fissa del sito. Nessuna porta aperta, password admin o token GitHub. L'endpoint esporta soltanto la stessa proiezione pubblica del sito; errori DB falliscono senza esportare fallback. L'esportazione viene riletta dopo il download; se cambia si riprova al prossimo giro. Questo riduce incoerenze, ma non è una transazione distribuita né una cronologia completa dei salvataggi.

Percorsi remoti canonici, redirect proibiti, JSON massimo 10 MiB, solo varianti WebP statiche da massimo 4 MiB, snapshot massimo 100 MiB/500 varianti. Le immagini locali originali restano già nel codice; sono scaricati solo gli upload pubblicati del CMS. Il manifesto mantiene la corrispondenza fra URL online e copie locali. Bozze e credenziali sono escluse. I contenuti una volta committati in una repo pubblica restano nella cronologia anche se poi rimossi dal sito.

La replica è in `content/published`, non modifica sorgenti, `.git`, default del CMS o database remoto. Non è un ripristino automatico: avviare la repo con questi file non importa da solo la copia nel database. Per ripristinare un backup bisogna importarlo esplicitamente, preservando ownership e pubblicazione dei media. Non sostituire i default alla cieca con il JSON.

Modifiche manuali nella replica bloccano la sincronizzazione anziché essere sovrascritte. Una copia precedente è conservata in `.cms-sync/previous`; se modifichi anche quella, non viene eliminata. Per risolvere un conflitto conserva la tua modifica fuori dalle cartelle gestite, confrontala con la copia precedente e ripristina la versione originale prima di rilanciare. Non cancellare lo stato per forzare una sovrascrittura.

Un arresto improvviso durante il cambio directory può richiedere recupero manuale: i dati restano nella copia precedente; il sistema segnala conflitto anziché indovinare. In caso di lock residuo controllare che non esista un processo di sincronizzazione prima di rimuovere la sola cartella vuota `.cms-sync/lock`.

Per disabilitare: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/it.tuttorifiuto.content-sync.plist`. Conservare o rimuovere poi il plist per evitare l'avvio al login successivo.
