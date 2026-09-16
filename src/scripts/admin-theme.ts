import { stringPalette, type ThemeChange } from './admin-types.ts';
import { THEME_TOKENS, DEFAULT_PALETTE, validatePalette, themeProperties, contrastRatio } from '../data/theme.ts';

// Only the value editor belongs here. Saving, CSRF, draft revisions and busy
// controls remain owned by the existing CMS content-card lifecycle.
export function themeEditor(document: Document, value: unknown, onChange: ThemeChange) {
  let palette = stringPalette(value);
  const wrap = document.createElement('div'); wrap.className = 'admin-theme';
  const previews = document.createElement('div'); previews.className = 'admin-theme-previews';
  const warning = document.createElement('p'); warning.setAttribute('role', 'status');
  const update = () => {
    const valid = validatePalette(palette);
    warning.textContent = valid ? [
      ['Testo / fondo', palette.foreground, palette.background],
      ['Testo sagoma / accento', palette.foreground, palette.accent],
      ['Link menu / accento', palette.background, palette.accent],
      ['Link menu / inchiostro', palette.background, palette.foreground],
    ].map(([label, a, b]) => {const ratio = contrastRatio(a ?? "", b ?? ""); return `${label}: ${ratio.toFixed(2)}:1${ratio < 4.5 ? ' — contrasto insufficiente per testo piccolo (4.5:1)' : ''}`;}).join('. ') : 'Inserisci tutti i colori nel formato #RRGGBB prima di salvare.';
    if (valid) for (const [key, color] of Object.entries(themeProperties(palette))) previews.style.setProperty(key, color);
  };
  for (const [key, token] of Object.entries(THEME_TOKENS)) {
    const row = document.createElement('div'); row.className = 'admin-theme-row';
    const label = document.createElement('label'); label.textContent = token.label;
    const picker = document.createElement('input'); picker.type = 'color'; picker.value = palette[key] ?? ""; picker.setAttribute('aria-label', token.label); picker.dataset.themePicker = key;
    const hex = document.createElement('input'); hex.type = 'text'; hex.value = palette[key] ?? ""; hex.dataset.themeHex = key; hex.setAttribute('aria-label', `${token.label} esadecimale`); hex.setAttribute('spellcheck','false'); hex.setAttribute('maxlength','7');
    const uses = document.createElement('p'); uses.textContent = `${token.uses}. Collegamenti: ${token.properties.join(', ')}`;
    const change = (next: string) => { palette = {...palette, [key]: next}; onChange(next, [key]); update(); };
    picker.addEventListener('input', () => { hex.value = picker.value; change(picker.value); });
    hex.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value; change(hex.value); });
    label.append(picker); row.append(label, hex, uses); wrap.append(row);
  }
  for (const [name, text] of [['normal', 'Testo su fondo · pulsante menu sopra superfici scure'], ['inverse', 'Testo su inchiostro · pulsante menu sopra superfici chiare'], ['accent', 'Testo della sagoma su accento'], ['menu-accent', 'Link menu su accento']]) {
    const sample = document.createElement('div'); sample.className = `admin-theme-preview ${name}`; sample.textContent = text ?? ''; previews.append(sample);
  }
  const note = document.createElement('p');
  note.textContent = 'L’atmosfera animata mescola accento e inchiostro: i due rapporti dei link verificano i colori estremi, non garantiscono il contrasto di ogni fotogramma.';
  const reset = document.createElement('button'); reset.type='button'; reset.textContent='Palette iniziale in anteprima';
  reset.addEventListener('click', () => {
    palette = {...DEFAULT_PALETTE}; onChange({...DEFAULT_PALETTE}, []);
    for (const key of Object.keys(THEME_TOKENS)) { const picker = wrap.querySelector<HTMLInputElement>(`[data-theme-picker="${key}"]`), hex = wrap.querySelector<HTMLInputElement>(`[data-theme-hex="${key}"]`); if (picker) picker.value = palette[key] ?? ""; if (hex) hex.value = palette[key] ?? ""; }
    update();
  });
  wrap.append(previews, warning, note, reset); update(); return wrap;
}
