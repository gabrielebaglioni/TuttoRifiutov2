import type { MediaOwnerType } from '../data/media-source.ts';
import type { ThemePalette } from '../data/theme.ts';

export type Kind = MediaOwnerType;
export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
export type Path = (string | number)[];
export interface Media { [key: string]: unknown; role: string; position: number; id?: number; alt?: string; src?: string; poster?: string; type?: string; virtual?: boolean; state?: string }
export interface MediaDraft { role: string; alt: string; position: number }
export interface Item { [key: string]: unknown; slug: string; title: string; position: number; isNew?: boolean; draftId?: string; media?: Media[]; coverMedia?: Record<string, unknown>; cardMedia?: Record<string, unknown>; detailMedia?: Record<string, unknown>[] }
export interface Session { authenticated?: boolean; csrfToken?: string }
export interface Snapshot { revision: number }
export interface KeySnapshot extends Snapshot { key: string }
export function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function isValue(value: unknown): value is Value {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' || (Array.isArray(value) ? value.every(isValue) : isRecord(value) && Object.values(value).every(isValue));
}
export function readValue(value: unknown): Value { if (!isValue(value)) throw new Error('Valore non valido'); return value; }
export function readContent(value: unknown): Record<string, Value> {
  if (!isRecord(value)) throw new Error('Contenuti non validi');
  const result: Record<string, Value> = {};
  for (const [key, entry] of Object.entries(value)) result[key] = readValue(entry);
  return result;
}
export function isMedia(value: unknown): value is Media {
  return isRecord(value) && typeof value.role === 'string' && typeof value.position === 'number'
    && (value.id === undefined || typeof value.id === 'number')
    && ['alt', 'src', 'poster', 'type', 'state'].every(key => value[key] === undefined || typeof value[key] === 'string')
    && (value.virtual === undefined || typeof value.virtual === 'boolean');
}
export function readMedia(value: unknown): Media { if (!isMedia(value)) throw new Error('Media non valido'); return value; }
export function readMediaDraft(value: unknown): MediaDraft { if (!isRecord(value) || typeof value.role !== 'string' || typeof value.alt !== 'string' || typeof value.position !== 'number') throw new Error('Bozza media non valida'); return { role:value.role, alt:value.alt, position:value.position }; }
export function isItem(value: unknown): value is Item {
  return isRecord(value) && typeof value.slug === 'string' && typeof value.title === 'string' && typeof value.position === 'number'
    && (value.isNew === undefined || typeof value.isNew === 'boolean') && (value.draftId === undefined || typeof value.draftId === 'string')
    && (value.media === undefined || Array.isArray(value.media) && value.media.every(isMedia))
    && (value.coverMedia === undefined || isRecord(value.coverMedia)) && (value.cardMedia === undefined || isRecord(value.cardMedia))
    && (value.detailMedia === undefined || Array.isArray(value.detailMedia) && value.detailMedia.every(isRecord));
}
export function readItem(value: unknown): Item { if (!isItem(value)) throw new Error('Elemento non valido'); return value; }
export function readItems(value: unknown): Item[] { if (!Array.isArray(value) || !value.every(isItem)) throw new Error('Elenco non valido'); return value; }
export function readSession(value: unknown): Session {
  if (!isRecord(value) || (value.authenticated !== undefined && typeof value.authenticated !== 'boolean') || (value.csrfToken !== undefined && typeof value.csrfToken !== 'string')) throw new Error('Sessione non valida');
  return { ...(typeof value.authenticated === 'boolean' ? {authenticated: value.authenticated}:{}), ...(typeof value.csrfToken === 'string' ? {csrfToken:value.csrfToken}:{}) };
}
export function isStale(value: unknown): boolean { return isRecord(value) && Boolean(value.stale); }
export function errorMessage(value: unknown): string { return isRecord(value) && typeof value.error === 'string' && value.error ? value.error : 'Operazione non riuscita'; }
export function stringPalette(value: unknown): Record<string,string> { const result: Record<string,string> = {}; if(isRecord(value)) for(const [key,entry] of Object.entries(value)) if(typeof entry === 'string') result[key]=entry; return result; }
export function readChild(value: unknown, key: string | number): unknown { return Array.isArray(value) && typeof key === 'number' ? value[key] : isRecord(value) ? value[String(key)] : undefined; }
export function readArray(value: unknown): unknown[] { if(!Array.isArray(value)) throw new Error('Elenco non valido'); return value; }
export function swap<T>(values: T[], from: number, to: number): void { const left=values[from], right=values[to]; if(left === undefined || right === undefined) return; values[from]=right; values[to]=left; }
export type ThemeChange = (value: string | ThemePalette, path: string[]) => void;
