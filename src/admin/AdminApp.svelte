<script lang="ts">
  import { onMount } from 'svelte';
  import { createAdminStore, sections, sectionFor, collectionKey, type Section, type Kind } from './store';
  import { contentLabel } from '../scripts/admin-labels.js';
  import { THEME_KEY } from '../data/theme.js';
  import ValueEditor from './ValueEditor.svelte';
  import ThemeEditor from './ThemeEditor.svelte';
  import CollectionEditor from './CollectionEditor.svelte';
  const store = createAdminStore();
  // Store snapshots are immutable at the UI boundary; do not proxy CMS drafts.
  let ui = $state.raw({ ...store.state });
  let username = $state(''), password = $state(''), published = $state(''), checking = $state(false);
  const keys = $derived(Object.keys(ui.content).filter(key => sectionFor(key) === ui.section));
  onMount(() => {
    const unsubscribe = store.subscribe(() => { ui = { ...store.state }; });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (store.state.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    void store.boot();
    return () => { unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); };
  });
  async function login(event: SubmitEvent) { event.preventDefault(); await store.login(username, password); password = ''; }
  async function checkPublished() {
    checking = true; published = 'Verifica in corso…';
    try {
      const response = await fetch('/api/published-snapshot', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('unavailable');
      const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      published = `Versione online: ${Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')}. Confrontala con revision in content/published/manifest.json sul Mac.`;
    } catch { published = 'Versione online non verificabile in questo momento. Riprova.'; }
    finally { checking = false; }
  }
</script>

{#snippet contentCard(key: string)}
  {@const value = (ui.revision, store.draft(`content:${key}`, ui.content[key]))}
  <details class="admin-card admin-disclosure" open={key === THEME_KEY}>
    <summary><h3>{key === THEME_KEY ? 'Palette del sito' : contentLabel(key)}</h3></summary>
    <p class="admin-key">{key}</p>
    {#if key === THEME_KEY}<ThemeEditor value={value as Record<string, string>} onchange={(next, path) => store.edit(`content:${key}`, path, next)} />
    {:else}<ValueEditor {value} path={key} onchange={(next, path) => store.edit(`content:${key}`, path, next)} />{/if}
    <div class="admin-actions">
      <button type="button" onclick={() => store.saveContent(key)}>Salva</button>
      <button type="button" class="admin-quiet" onclick={() => store.cancel(`content:${key}`)}>Annulla modifiche</button>
      <button type="button" class="admin-quiet" onclick={() => store.saveContent(key, true)}>Ripristina placeholder</button>
    </div>
  </details>
{/snippet}

<main class="admin-shell">
  {#if !ui.authenticated}
    <section class="admin-login" id="admin-login" aria-labelledby="admin-login-title">
      <p class="admin-kicker">Tutto Rifiuto / area privata</p><h1 id="admin-login-title">Accedi</h1>
      <form id="admin-login-form" onsubmit={login}>
        <fieldset disabled={ui.busy}>
          <label>Identificativo<input name="username" autocomplete="username" bind:value={username} required /></label>
          <label>Parola d’accesso<input name="password" type="password" autocomplete="current-password" bind:value={password} required /></label>
          <button type="submit">Entra</button>
        </fieldset>
      </form>
      <p class="admin-status" role="status" aria-live="polite" data-kind={ui.error ? 'error' : undefined}>{ui.message}</p>
    </section>
  {:else}
    <section class="admin-editor" id="admin-editor" aria-labelledby="admin-title" aria-busy={ui.busy}>
      <header class="admin-header"><div><p class="admin-kicker">Tutto Rifiuto / CMS</p><h1 id="admin-title" tabindex="-1">Contenuti</h1></div><button type="button" disabled={ui.busy} onclick={() => store.logout()}>Esci</button></header>
      <nav class="admin-tabs" aria-label="Sezioni editor">{#each Object.entries(sections) as [key, title]}<button type="button" disabled={ui.busy} aria-current={ui.section === key ? 'page' : undefined} onclick={() => store.select(key as Section)}>{title}</button>{/each}</nav>
      <p class="admin-status" role="alert" data-kind={ui.error ? 'error' : undefined}>{ui.message}</p>
      <p aria-live="polite">{ui.dirty ? `${ui.dirty} modifiche non salvate` : 'Nessuna modifica non salvata'}</p>
      <fieldset disabled={ui.busy} id="admin-panels">
        {#each keys.filter(key => !key.startsWith('seo.')) as key (key)}{@render contentCard(key)}{/each}
        {#if ui.section === 'events' || ui.section === 'archive'}
          {@const kind = ui.section as Kind}
          <section class="admin-panel"><h2>{sections[kind]}</h2><button type="button" onclick={() => store.add(kind)}>Crea nuovo {kind === 'events' ? 'evento' : 'pacchetto'}</button>
            {#each ui.collections[kind] as item, index (collectionKey(kind, item))}<CollectionEditor {store} revision={ui.revision} {kind} {item} {index} />{/each}
          </section>
        {/if}
        {#each keys.filter(key => key.startsWith('seo.')) as key (key)}{@render contentCard(key)}{/each}
      </fieldset>
      <details class="admin-card"><summary>Pubblicazione e copia locale</summary>
        <p>I testi salvati e gli elementi pubblicati vengono letti dal sito al caricamento della pagina, senza una nuova build.</p>
        <p>Il sincronizzatore sul Mac controlla i contenuti ogni minuto quando sei connesso. Commit e push su GitHub restano manuali. Questa pagina non può conoscere lo stato del Mac o del push.</p>
        <button type="button" disabled={checking} onclick={checkPublished}>Verifica la versione online</button><p role="status" aria-live="polite">{published}</p>
      </details>
    </section>
  {/if}
</main>
<style>
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 1rem; }
</style>
