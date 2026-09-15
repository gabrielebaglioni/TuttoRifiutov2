<script lang="ts">
  import { mediaKey, type AdminStore, type Item, type Kind } from './store';
  import { mediaPreviewKind } from '../scripts/admin-model.js';
  let { store, revision, kind, item, media }: { store: AdminStore; revision: number; kind: Kind; item: Item; media: any } = $props();
  const resource = $derived(mediaKey(kind, item, media));
  const draft = $derived.by(() => { revision; return store.draft(resource, { role: media.role, alt: media.alt || '', position: media.role === 'cover' ? 0 : media.position }); });
  function upload(event: Event) { const input = event.currentTarget as HTMLInputElement; const file = input.files?.[0]; if (file) void store.upload(kind, item, media, file); input.value = ''; }
</script>
<section class="admin-media">
  {#if media.src}
    {#if mediaPreviewKind(media) === 'video'}<video src={media.src} aria-label={draft.alt || 'Anteprima video'} controls muted playsinline preload="metadata"></video>
    {:else}<img src={media.src} alt={draft.alt} loading="lazy" decoding="async" />{/if}
  {:else}<p>Nessuna immagine caricata</p>{/if}
  <div class="admin-media-controls">
    <label>Ruolo<select value={draft.role} onchange={event => store.edit(resource, ['role'], event.currentTarget.value)}><option value="cover">Copertina / hero</option><option value="detail">Galleria di dettaglio</option></select></label>
    <label>Descrizione accessibile<input value={draft.alt} oninput={event => store.edit(resource, ['alt'], event.currentTarget.value)} /></label>
    <label>Posizione<input type="number" min="0" readonly={draft.role === 'cover'} value={draft.role === 'cover' ? 0 : draft.position} oninput={event => store.edit(resource, ['position'], Number(event.currentTarget.value))} /></label>
    <label>Sostituisci immagine<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onchange={upload} /></label>
  </div>
  {#if Number.isSafeInteger(media.id)}
    <div class="admin-actions">
      <button type="button" onclick={() => store.saveMedia(kind, item, media)}>Salva descrizione e posizione</button>
      <button type="button" class="admin-quiet" onclick={() => { if (confirm('Rimuovere questa immagine?')) void store.saveMedia(kind, item, media, true); }}>Rimuovi immagine</button>
      {#if draft.role === 'detail'}<button type="button" class="admin-quiet" onclick={() => store.reorderMedia(kind, item, media, -1)}>Sposta ↑</button><button type="button" class="admin-quiet" onclick={() => store.reorderMedia(kind, item, media, 1)}>Sposta ↓</button>{/if}
    </div>
  {/if}
</section>
