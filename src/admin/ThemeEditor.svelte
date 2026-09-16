<script lang="ts">
  import { THEME_TOKENS, DEFAULT_PALETTE, validatePalette, themeCss, contrastRatio } from '../data/theme.ts';
  import type { ThemePalette, ThemeToken } from '../data/theme.ts';
  let { value, onchange }: { value: Record<string, string>; onchange: (value: string | ThemePalette, path: string[]) => void } = $props();
  const pairs = [['Testo / fondo', 'foreground', 'background'], ['Testo sagoma / accento', 'foreground', 'accent'], ['Link menu / accento', 'background', 'accent'], ['Link menu / inchiostro', 'background', 'foreground']] as const satisfies readonly (readonly [string, ThemeToken, ThemeToken])[];
</script>
<div class="admin-theme">
  {#each Object.entries(THEME_TOKENS) as [key, token] (key)}
    <div class="admin-theme-row">
      <label>{token.label}<input type="color" value={/^#[\da-f]{6}$/i.test(value[key] ?? "") ? value[key] : token.color} oninput={event => onchange(event.currentTarget.value, [key])} /></label>
      <input aria-label={`${token.label} esadecimale`} maxlength="7" spellcheck="false" value={value[key]} oninput={event => onchange(event.currentTarget.value, [key])} />
      <p>{token.uses}. Collegamenti: {token.properties.join(', ')}</p>
    </div>
  {/each}
  <div class="admin-theme-previews" style={themeCss(value)}>
    <div class="admin-theme-preview normal">Testo su fondo · pulsante menu sopra superfici scure</div>
    <div class="admin-theme-preview inverse">Testo su inchiostro · pulsante menu sopra superfici chiare</div>
    <div class="admin-theme-preview accent">Testo della sagoma su accento</div>
    <div class="admin-theme-preview menu-accent">Link menu su accento</div>
  </div>
  <p role="status">{#if validatePalette(value)}{#each pairs as [label, a, b]}{label}: {contrastRatio(value[a], value[b]).toFixed(2)}:1{contrastRatio(value[a], value[b]) < 4.5 ? ' — contrasto insufficiente per testo piccolo' : ''}. {/each}{:else}Inserisci tutti i colori nel formato #RRGGBB prima di salvare.{/if}</p>
  <p>L’atmosfera animata mescola accento e inchiostro: i rapporti dei link verificano i colori estremi, non ogni fotogramma.</p>
  <button type="button" onclick={() => onchange({ ...DEFAULT_PALETTE }, [])}>Palette iniziale in anteprima</button>
</div>
