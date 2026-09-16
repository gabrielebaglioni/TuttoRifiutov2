<script lang="ts">
  import { collectionKey, fields, mediaKey, type AdminStore, type Item, type Kind } from './store';
  import { mergeMediaSlots } from '../scripts/admin-model.ts';
  import ValueEditor from './ValueEditor.svelte';
  import MediaEditor from './MediaEditor.svelte';
  let { store, revision, kind, item, index }: { store: AdminStore; revision: number; kind: Kind; item: Item; index: number } = $props();
  const resource = $derived(collectionKey(kind, item));
  const draft = $derived.by(() => { revision; return store.itemDraft(resource, item); });
  const media = $derived(mergeMediaSlots(draft));
  const cover = $derived(media.find(entry => entry.role === 'cover') || { role: 'cover', position: 0, alt: '' });
  const gallery = $derived(media.filter(entry => entry.role === 'detail'));
  const stages = [
    { title: '02 · Titolo e presentazione iniziale', keys: ['title', 'summary', 'code', 'meta'] },
    { title: '03 · Descrizione e informazioni', keys: ['description', 'info', 'details'] },
    { title: '05 · Testi conclusivi', keys: ['outro', 'outroInfo'] },
    { title: '06 · Pubblicazione, indirizzo e ricerca', keys: ['status', 'slug', 'href', 'seo', 'position'] },
  ];
</script>
<details class="admin-card admin-disclosure" open={item.isNew}>
  <summary><h3>{draft.title || draft.slug}</h3></summary>
  <p class="admin-key">{kind} / {draft.slug}</p>
  <details class="admin-disclosure" open><summary>01 · Copertina dell’elenco e immagine hero</summary><MediaEditor {store} {revision} {kind} {item} media={cover} /></details>
  {#each stages as stage, stageIndex}
    {#if stageIndex === 2}
      <details class="admin-disclosure"><summary>04 · Galleria di dettaglio</summary>
        {#each gallery as image (mediaKey(kind, item, image))}<MediaEditor {store} {revision} {kind} {item} media={image} />{/each}
        <MediaEditor {store} {revision} {kind} {item} media={{ role: 'detail', position: gallery.length ? Math.max(...gallery.map(entry => entry.position)) + 1 : 0, alt: '' }} />
      </details>
    {/if}
    <details class="admin-disclosure"><summary>{stage.title}</summary>
      {#each stage.keys.filter(key => fields[kind].includes(key)) as key (key)}
        <ValueEditor value={draft[key]} path={key} readonly={key === 'slug' && !item.isNew} onchange={(value, path) => store.edit(resource, [key, ...path], value)} />
      {/each}
    </details>
  {/each}
  <div class="admin-actions">
    <button type="button" onclick={() => store.saveCollection(kind, item)}>Salva elemento</button>
    <button type="button" class="admin-quiet" onclick={() => store.cancel(resource)}>Annulla modifiche</button>
    <button type="button" class="admin-quiet" onclick={() => { if (item.isNew || confirm('Eliminare questo elemento?')) void store.removeCollection(kind, item); }}>Elimina elemento</button>
    <button type="button" class="admin-quiet" disabled={index === 0} onclick={() => store.reorderCollection(kind, index, -1)}>Sposta ↑</button>
    <button type="button" class="admin-quiet" disabled={index === store.state.collections[kind].length - 1} onclick={() => store.reorderCollection(kind, index, 1)}>Sposta ↓</button>
  </div>
</details>
