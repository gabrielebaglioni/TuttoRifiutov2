// Shared, pure schema for the CMS, initial HTML, CSS and GPU adapters.
export const THEME_KEY = 'global.theme.palette';
export const THEME_TOKENS = Object.freeze({
  background: { color: '#ffff00', label: 'Fondo / giallo', uses: 'Superfici, logo, grana skyline e anello; link del menu aperto; barre del pulsante su superfici chiare e fondo del pulsante su superfici scure', properties: ['--bg', '--menu-inverse-fg'] },
  foreground: { color: '#000000', label: 'Inchiostro', uses: 'Testi, icone, transizioni, grana, bordo esterno; fondo del pulsante menu su superfici chiare e barre su superfici scure', properties: ['--fg', '--menu-inverse-bg'] },
  accent: { color: '#2444d9', label: 'Accento / blu', uses: 'Atmosfera menu e sagoma animata (SVG e Canvas)', properties: ['--accent'] },
  loading: { color: '#1a1a1a', label: 'Traccia caricamento', uses: 'Fondo della barra di caricamento', properties: ['--loading'] },
  highlight: { color: '#ffffff', label: 'Riflessi del marchio', uses: 'Riflessi delle particelle nel marchio iniziale; ombre collegate all’inchiostro', properties: ['--highlight'] },
});
export type ThemeToken = keyof typeof THEME_TOKENS;
export type ThemePalette = Record<ThemeToken, string>;
export type ThemeProperties = Record<string, string>;
export const DEFAULT_PALETTE: Readonly<ThemePalette> = Object.freeze({
  background: THEME_TOKENS.background.color,
  foreground: THEME_TOKENS.foreground.color,
  accent: THEME_TOKENS.accent.color,
  loading: THEME_TOKENS.loading.color,
  highlight: THEME_TOKENS.highlight.color,
});
// Deliberately protected: public palette edits must never make the CMS unusable.
export const ADMIN_COLORS = Object.freeze({ yellow: '#fff500', ink: '#111111', paper: '#f5f2e8', field: '#ffffff', error: '#aa0000' });
export function adminThemeCss(): string { return Object.entries(ADMIN_COLORS).map(([key, color]) => `--admin-${key}:${color}`).join(';'); }
export function validatePalette(value: unknown): value is ThemePalette {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== Object.keys(THEME_TOKENS).length) return false;
  return Object.keys(THEME_TOKENS).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string' && /^#[0-9a-f]{6}$/i.test(descriptor.value);
  });
}
export function themeProperties(value: unknown): ThemeProperties {
  const palette = validatePalette(value) ? value : DEFAULT_PALETTE;
  return Object.fromEntries(Object.entries(THEME_TOKENS).flatMap(([key, token]) => {
    const color = Object.entries(palette).find(([paletteKey]) => paletteKey === key)?.[1] ?? token.color;
    return token.properties.map((property) => [property, color.toLowerCase()]);
  }));
}
export function themeCss(value: unknown): string { return Object.entries(themeProperties(value)).map(([key, color]) => `${key}:${color}`).join(';'); }
export function colorChannels(hex: string): number[] { return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255); }
export function contrastRatio(left: string, right: string): number {
  const weights = [.2126, .7152, .0722];
  const luminance = (hex: string) => colorChannels(hex).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * (weights[i] ?? 0), 0);
  const a = luminance(left), b = luminance(right);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
