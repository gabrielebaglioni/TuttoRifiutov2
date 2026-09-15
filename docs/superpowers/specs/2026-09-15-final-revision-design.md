# Revisione finale — design approvato

Il 15 settembre 2026 l'utente ha approvato un modello di colori collegati per ruolo e richiesto l'implementazione su `finalRev`. Checkpoint immutato su main: c81f2e7.

## Requisiti
- Conservare l'aspetto corrente come default, tutte le animazioni e il percorso Chrome Android/iOS confermato funzionante.
- Un registro condiviso contiene i colori editoriali del sito, degli shader, del menu, delle icone e dei controlli admin. I colori tecnici di maschere/alpha e quelli incorporati nelle fotografie non sono colori editoriali: non devono essere alterati.
- I ruoli collegati non sono duplicati: menu normale/invertito e superfici/testi usano riferimenti obbligatori agli stessi colori. L'admin mostra utilizzi e collegamenti e salva una palette completa atomicamente con le protezioni CMS esistenti. Nessun CSS libero o URL nei valori colore.
- Palette iniziale identica al sito attuale; validazione client/server; ripristino della palette iniziale; avviso sui contrasti insufficienti. Admin deve restare recuperabile e leggibile anche quando la palette pubblica ha contrasto scarso.
- Colori disponibili già nella risposta HTML pubblica, senza attendere la richiesta dei testi. Aggiornamenti CMS inclusi nel normale snapshot e sincronizzatore locale; nessun GitHub Actions o push GitHub automatico.
- Revisione dei browser basata sulle versioni bloccate nel lockfile, funzionalità rilevate e fonti ufficiali; alternative visive utilizzabili quando WebGL o animazioni avanzate non sono disponibili. Non promettere test hardware non eseguiti.
- Layout responsivo: controlli su 320/390/768/820/1024/1180/1440/2560 px, portrait/landscape, testi lunghi, ingrandimento e reduced-motion. Preferire contenitori fluidi con limiti, non conversione indiscriminata a percentuali.
- Revisione sicurezza di worker, auth, upload, rendering, dipendenze, sincronizzazione e CSP. Non modificare credenziali né pubblicare contenuti di prova. Rischi documentati con evidenza e severità.
- Nessun merge su main. Test prima delle correzioni, build e revisione prima della pubblicazione Sites prevista dal workflow corrente. Il branch GitHub resta locale fino a richiesta di push.

## Architettura
Registro tema puro condiviso browser/worker/build; un solo valore CMS per la palette; CSS custom properties e adattatori Canvas/WebGL consumano lo stesso registro. Editor tema separato dalla logica generica dei contenuti, integrato nelle bozze e nei controlli busy già esistenti. Nessuna nuova dipendenza runtime per il tema.

## Criteri di accettazione
Una modifica valida alla palette cambia contemporaneamente superfici CSS e shader collegati; valori invalidi non vengono salvati; ripristino e bozze non perse; controlli admin e immagini di dettaglio continuano a funzionare. Nessun colore editoriale indipendente hardcoded fuori dal registro, con eccezioni tecniche documentate. Report distingue browser verificati, compatibilità documentata e prove fisiche ancora richieste.
