// Shared, pure schema for the CMS, initial HTML, CSS and GPU adapters.
export const THEME_KEY = 'global.theme.palette';
export const THEME_TOKENS = Object.freeze({
  background: { color: '#ffff00', label: 'Fondo / giallo', uses: 'Superfici, logo, grana skyline e anello; testo del menu invertito', properties: ['--bg', '--menu-inverse-fg'] },
  foreground: { color: '#000000', label: 'Inchiostro', uses: 'Testi, icone, transizioni, grana; fondo del menu invertito e bordo esterno', properties: ['--fg', '--menu-inverse-bg'] },
  accent: { color: '#2444d9', label: 'Accento / blu', uses: 'Atmosfera menu e sagoma animata (SVG e Canvas)', properties: ['--accent'] },
  loading: { color: '#1a1a1a', label: 'Traccia caricamento', uses: 'Fondo della barra di caricamento', properties: ['--loading'] },
  highlight: { color: '#ffffff', label: 'Riflessi del marchio', uses: 'Riflessi delle particelle nel marchio iniziale; ombre collegate all’inchiostro', properties: ['--highlight'] },
});
export const DEFAULT_PALETTE = Object.freeze(Object.fromEntries(Object.entries(THEME_TOKENS).map(([key, token]) => [key, token.color])));
// Deliberately protected: public palette edits must never make the CMS unusable.
export const ADMIN_COLORS = Object.freeze({ yellow: '#fff500', ink: '#111111', paper: '#f5f2e8', field: '#ffffff', error: '#aa0000' });
export function adminThemeCss() { return Object.entries(ADMIN_COLORS).map(([key, color]) => `--admin-${key}:${color}`).join(';'); }
export function validatePalette(value) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== Object.keys(THEME_TOKENS).length) return false;
  return Object.keys(THEME_TOKENS).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string' && /^#[0-9a-f]{6}$/i.test(descriptor.value);
  });
}
export function themeProperties(value) {
  const palette = validatePalette(value) ? value : DEFAULT_PALETTE;
  return Object.fromEntries(Object.entries(THEME_TOKENS).flatMap(([key, token]) => token.properties.map((property) => [property, palette[key].toLowerCase()])));
}
export function themeCss(value) { return Object.entries(themeProperties(value)).map(([key, color]) => `${key}:${color}`).join(';'); }
export function colorChannels(hex) { return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255); }
export function contrastRatio(left, right) {
  const luminance = (hex) => colorChannels(hex).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const a = luminance(left), b = luminance(right);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
