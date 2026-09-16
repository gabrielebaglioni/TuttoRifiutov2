import {
  THEME_TOKENS,
  DEFAULT_PALETTE,
  validatePalette,
  themeProperties,
  colorChannels,
} from '../data/theme.ts';
import type { ThemePalette, ThemeToken } from '../data/theme.ts';

export type ThemeColorChannels = [red: number, green: number, blue: number];
export type ThemeRgb = Record<ThemeToken, ThemeColorChannels>;

export interface ThemeSnapshot {
  palette: ThemePalette;
  rgb: ThemeRgb;
}

export type ThemeListener = (snapshot: ThemeSnapshot) => void;
export type ThemeComputedStyle = (element: Element) => Pick<CSSStyleDeclaration, 'getPropertyValue'>;

export interface ThemeController {
  current(): ThemeSnapshot;
  subscribe(listener: ThemeListener): () => boolean;
  apply(value: unknown): boolean;
}

export interface ThemeUniform {
  value: unknown;
}

export type ThemeUniforms = Record<string, ThemeUniform | undefined>;
export type ThemeUniformMapping = Record<string, ThemeToken>;

interface ThemeVectorValue {
  set(red: number, green: number, blue: number): unknown;
}

function defaultComputedStyle(root: Document, element: Element): CSSStyleDeclaration {
  const view = root.defaultView;
  if (!view) throw new TypeError('Theme document has no default view');
  return view.getComputedStyle(element);
}

function themeChannels(hex: string): ThemeColorChannels {
  const [red = 0, green = 0, blue = 0] = colorChannels(hex);
  return [red, green, blue];
}

function isThemeVectorValue(value: unknown): value is ThemeVectorValue {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  return typeof Reflect.get(value, 'set') === 'function';
}

export function createThemeController(
  root: Document,
  computedStyle: ThemeComputedStyle = (element) => defaultComputedStyle(root, element),
): ThemeController {
  const listeners = new Set<ThemeListener>();
  let snapshot: ThemeSnapshot | undefined;

  function readPalette(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): ThemePalette {
    const readToken = (token: ThemeToken): string => {
      const property = THEME_TOKENS[token].properties[0];
      const value = property ? (style.getPropertyValue(property) ?? '').trim() : '';
      return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_PALETTE[token];
    };
    return {
      background: readToken('background'),
      foreground: readToken('foreground'),
      accent: readToken('accent'),
      loading: readToken('loading'),
      highlight: readToken('highlight'),
    };
  }

  function read(): ThemeSnapshot {
    // One computed-style snapshot for all CSS/Canvas/WebGL consumers per change.
    const style = computedStyle(root.documentElement);
    const palette = readPalette(style);
    snapshot = {
      palette,
      rgb: {
        background: themeChannels(palette.background),
        foreground: themeChannels(palette.foreground),
        accent: themeChannels(palette.accent),
        loading: themeChannels(palette.loading),
        highlight: themeChannels(palette.highlight),
      },
    };
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
      // read assigned snapshot; reentrant subscribers may update it again.
      for (const listener of listeners) listener(snapshot!);
      return true;
    },
  };
}

const controllers = new WeakMap<Document, ThemeController>();
export function publicTheme(root: Document = document): ThemeController {
  const existing = controllers.get(root);
  if (existing) return existing;
  const controller = createThemeController(root);
  controllers.set(root, controller);
  return controller;
}

export function bindThemeUniforms(
  uniforms: ThemeUniforms,
  mapping: ThemeUniformMapping,
  onChange: () => void = () => {},
  root: Document = document,
): () => boolean {
  return publicTheme(root).subscribe(({rgb}) => {
    for (const [name, token] of Object.entries(mapping)) {
      const channels = rgb[token];
      const uniform = uniforms[name];
      if (uniform && isThemeVectorValue(uniform.value)) uniform.value.set(...channels);
      else uniforms[name] = {value: channels.slice()};
    }
    onChange();
  });
}
