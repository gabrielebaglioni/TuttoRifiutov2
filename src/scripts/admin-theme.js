import { THEME_TOKENS, DEFAULT_PALETTE, validatePalette, themeProperties, contrastRatio } from '../data/theme.js';

// Only the value editor belongs here. Saving, CSRF, draft revisions and busy
// controls remain owned by the existing CMS content-card lifecycle.
export function themeEditor(document, value, onChange) {
  let palette = {...value};
  const wrap = document.createElement('div'); wrap.className = 'admin-theme';
  const previews = document.createElement('div'); previews.className = 'admin-theme-previews';
  const warning = document.createElement('p'); warning.setAttribute('role', 'status');
  const update = () => {
    const valid = validatePalette(palette);
    warning.textContent = valid ? [
      ['Testo / fondo', palette.foreground, palette.background],
      ['Menu / accento', palette.foreground, palette.accent],
    ].map(([label, a, b]) => {const ratio = contrastRatio(a,b); return `${label}: ${ratio.toFixed(2)}:1${ratio < 4.5 ? ' — contrasto insufficiente per testo piccolo (4.5:1)' : ''}`;}).join('. ') : 'Inserisci tutti i colori nel formato #RRGGBB prima di salvare.';
    if (valid) for (const [key, color] of Object.entries(themeProperties(palette))) previews.style.setProperty(key, color);
  };
  for (const [key, token] of Object.entries(THEME_TOKENS)) {
    const row = document.createElement('div'); row.className = 'admin-theme-row';
    const label = document.createElement('label'); label.textContent = token.label;
    const picker = document.createElement('input'); picker.type = 'color'; picker.value = palette[key]; picker.setAttribute('aria-label', token.label); picker.dataset.themePicker = key;
    const hex = document.createElement('input'); hex.type = 'text'; hex.value = palette[key]; hex.dataset.themeHex = key; hex.setAttribute('aria-label', `${token.label} esadecimale`); hex.setAttribute('spellcheck','false'); hex.setAttribute('maxlength','7');
    const uses = document.createElement('p'); uses.textContent = `${token.uses}. Collegamenti: ${token.properties.join(', ')}`;
    const change = (next) => { palette = {...palette, [key]: next}; onChange(next, [key]); update(); };
    picker.addEventListener('input', () => { hex.value = picker.value; change(picker.value); });
    hex.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value; change(hex.value); });
    label.append(picker); row.append(label, hex, uses); wrap.append(row);
  }
  for (const [name, text] of [['normal', 'Anteprima — testo, icone e fondo'], ['inverse', 'Menu invertito — ruoli collegati'], ['accent', 'Atmosfera menu / accento']]) {
    const sample = document.createElement('div'); sample.className = `admin-theme-preview ${name}`; sample.textContent = text; previews.append(sample);
  }
  const reset = document.createElement('button'); reset.type='button'; reset.textContent='Palette iniziale in anteprima';
  reset.addEventListener('click', () => {
    palette = {...DEFAULT_PALETTE}; onChange(palette, []);
    for (const key of Object.keys(THEME_TOKENS)) { wrap.querySelector(`[data-theme-picker="${key}"]`).value = palette[key]; wrap.querySelector(`[data-theme-hex="${key}"]`).value = palette[key]; }
    update();
  });
  wrap.append(previews, warning, reset); update(); return wrap;
}
