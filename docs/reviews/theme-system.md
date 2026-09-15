# Colori globali e admin

La palette `global.theme.palette` è un singolo valore CMS, completo e validato: fondo, inchiostro, accento, traccia caricamento e riflessi del marchio. `src/data/theme.js` contiene default, etichette, utilizzi e proprietà collegate. L'admin mostra anteprime e contrasti, conserva le bozze fra tab e salva con autenticazione/CSRF esistenti.

Fondo e inchiostro determinano anche gli stati normali/invertiti del menu: non esistono copie indipendenti da desincronizzare. I colori pubblici arrivano nell'HTML iniziale e aggiornano CSS, Canvas e uniform shader tramite un controller condiviso, senza letture computed style a ogni frame. La palette entra nel normale snapshot e nella sincronizzazione locale. L'admin conserva colori protetti, per restare recuperabile anche con una palette pubblica illeggibile.

Esclusioni intenzionali: fotografie/gallerie, favicon/apple-touch-icon e immagine social raster non sono ricolorate dal CMS. Bianco/nero nelle maschere, clear completamente trasparenti, alpha e coefficienti matematici degli shader descrivono geometria/trasparenza, non colori editoriali. Loghi e icone visibili usano tint o currentColor. Non è stato modificato il disegno delle maschere.

Test: schema completo/injection/prototipi, salvataggio atomico e CSRF, bozza/annulla/reset, HTML iniziale anche sui dettagli statici senza record DB, adattatori shader e snapshot. Prova UI con palette alternativa eseguita solo su API locale in RAM: nessun dato pubblico alterato per il test.
