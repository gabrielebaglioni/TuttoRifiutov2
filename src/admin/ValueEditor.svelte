<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldLabel } from '../scripts/admin-labels.js';
  import type { Value } from './store';
  import ValueEditor from './ValueEditor.svelte';
  let { value, path, onchange, readonly = false }: { value: Value; path: string; onchange: (value: Value, path: (string | number)[]) => void; readonly?: boolean } = $props();
  // A keystroke must never replace its own focused control at the length limit.
  const multiline = untrack(() => typeof value === 'string' && (value.length > 130 || value.includes('\n')));
  function reorder(index: number, direction: number) {
    if (!Array.isArray(value)) return;
    const copy = value.slice(); [copy[index], copy[index + direction]] = [copy[index + direction], copy[index]]; onchange(copy, []);
  }
  function append() {
    if (!Array.isArray(value)) return;
    const sample = value[0] ?? (/(details|items|rows)$/.test(path) ? ['', ''] : /(info|outroInfo)$/.test(path) ? [['', '']] : '');
    onchange([...value, structuredClone(sample)], []);
  }
</script>

{#if typeof value === 'string'}
  <label class="admin-field"><span>{fieldLabel(path)}</span>
    {#if multiline}
      <textarea {readonly} value={value} oninput={event => onchange(event.currentTarget.value, [])}></textarea>
    {:else}
      <input type="text" {readonly} value={value} oninput={event => onchange(event.currentTarget.value, [])} />
    {/if}
  </label>
{:else if typeof value === 'number'}
  <label class="admin-field"><span>{fieldLabel(path)}</span><input type="number" {readonly} value={value} oninput={event => onchange(Number(event.currentTarget.value), [])} /></label>
{:else if typeof value === 'boolean'}
  <label class="admin-field"><span>{fieldLabel(path)}</span><input type="checkbox" disabled={readonly} checked={value} onchange={event => onchange(event.currentTarget.checked, [])} /></label>
{:else if Array.isArray(value)}
  <div><ol class="admin-list">
    {#each value as entry, index}
      <li class="admin-array-row">
        <ValueEditor value={entry} path={`${path}.${index + 1}`} onchange={(next, nested) => onchange(next, [index, ...nested])} />
        <div class="admin-array-tools">
          <button type="button" class="admin-quiet" disabled={index === 0} onclick={() => reorder(index, -1)}>Sposta ↑</button>
          <button type="button" class="admin-quiet" disabled={index === value.length - 1} onclick={() => reorder(index, 1)}>Sposta ↓</button>
          <button type="button" class="admin-quiet" onclick={() => onchange((value as Value[]).filter((_, row) => row !== index), [])}>Rimuovi riga</button>
        </div>
      </li>
    {/each}
  </ol><button type="button" class="admin-quiet" onclick={append}>Aggiungi riga</button></div>
{:else if value && typeof value === 'object'}
  <div class="admin-list">
    {#each Object.entries(value) as [key, child] (key)}
      <ValueEditor value={child} path={`${path}.${key}`} onchange={(next, nested) => onchange(next, [key, ...nested])} />
    {/each}
  </div>
{:else}<p>Valore non supportato</p>{/if}
