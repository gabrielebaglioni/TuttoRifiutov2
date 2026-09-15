import { THEME_TOKENS, DEFAULT_PALETTE, validatePalette, themeProperties, colorChannels } from '../data/theme.js';

export function createThemeController(root, computedStyle = (element) => root.defaultView.getComputedStyle(element)) {
  const listeners = new Set();
  let snapshot;
  function read() {
    // One computed-style snapshot for all CSS/Canvas/WebGL consumers per change.
    const style = computedStyle(root.documentElement);
    const palette = Object.fromEntries(Object.entries(THEME_TOKENS).map(([key, token]) => {
      const value = (style.getPropertyValue(token.properties[0]) ?? '').trim();
      return [key, /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_PALETTE[key]];
    }));
    snapshot = { palette, rgb: Object.fromEntries(Object.entries(palette).map(([key, value]) => [key, colorChannels(value)])) };
    return snapshot;
  }
  return {
    current() { return snapshot ?? read(); },
    subscribe(listener) { listeners.add(listener); listener(snapshot ?? read()); return () => listeners.delete(listener); },
    apply(value) {
      if (!validatePalette(value) || root.body?.classList.contains('admin-body')) return false;
      const properties = themeProperties(value);
      if (Object.entries(properties).every(([key, color]) => root.documentElement.style.getPropertyValue(key) === color)) return false;
      for (const [key, color] of Object.entries(properties)) root.documentElement.style.setProperty(key, color);
      root.querySelector('meta[name="theme-color"]')?.setAttribute('content', value.foreground);
      read();
      for (const listener of listeners) listener(snapshot);
      return true;
    },
  };
}
const controllers = new WeakMap();
export function publicTheme(root = document) {
  if (!controllers.has(root)) controllers.set(root, createThemeController(root));
  return controllers.get(root);
}
export function bindThemeUniforms(uniforms, mapping, onChange = () => {}, root = document) {
  return publicTheme(root).subscribe(({rgb}) => {
    for (const [name, token] of Object.entries(mapping)) {
      if (uniforms[name]?.value?.set) uniforms[name].value.set(...rgb[token]);
      else uniforms[name] = {value: rgb[token].slice()};
    }
    onChange();
  });
}
