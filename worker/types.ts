import type { D1Database, ExecutionContext, R2PutOptions } from '@cloudflare/workers-types/index.ts';
import type { MediaOwnerType, MediaSource } from '../src/data/media-source.ts';
import type { SiteContentValue } from '../src/data/site-content.ts';

export type CollectionKind = MediaOwnerType;
// Sessions share prepare/batch with D1Database, but cannot open more sessions.
export type WorkerDatabase = Pick<D1Database, 'prepare' | 'batch'> &
  Partial<Pick<D1Database, 'withSession'>>;
export type DatabaseReader = Pick<D1Database, 'prepare'>;
export type WorkerContext = Partial<Pick<ExecutionContext, 'waitUntil'>>;
// Portable ports describe only the platform operations the application consumes.
// Worker compile fixtures verify that real R2/Assets bindings satisfy these ports.
export interface MediaStore {
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; httpEtag: string; writeHttpMetadata(headers: Headers): void } | null>;
  put(key: string, value: Blob | ArrayBuffer, options?: R2PutOptions): Promise<unknown>;
  delete(key: string | string[]): Promise<void>;
}
export interface AssetStore { fetch(request: Request): Promise<Response> }
export interface WorkerEnv {
  DB?: WorkerDatabase;
  MEDIA?: MediaStore;
  ASSETS?: AssetStore;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}
export interface SessionRow {
  id: number;
  token_hash: string;
  csrf_token: string;
  expires_at: number;
}
export interface ContentRow {
  key: string;
  value_json: string;
  published: number;
  updated_at: number;
}
export interface ParentRow {
  id: number;
  deleting?: number;
  // Stored values are checked by isPublicEventStatus before publication.
  status?: unknown;
}
export type MediaRole = 'cover' | 'detail';
export type MediaState = 'active' | 'tombstone' | 'pending' | 'pending_cleanup';
export interface MediaManifestRow {
  id: number;
  key: string;
  role: MediaRole;
  alt: string;
  position: number;
  widths_json: string;
  sources_json?: string;
}
export interface MediaRow extends MediaManifestRow {
  state: MediaState;
  cleanup_attempts?: number;
  reservation_started_at?: number;
  event_id?: number;
  archive_item_id?: number;
}
export interface MediaProjection {
  id: number;
  key: string;
  role: MediaRole;
  alt: string;
  position: number;
  widths: number[];
  src: string;
  sources: MediaSource[];
}
export interface MediaMetadata {
  role: MediaRole;
  alt: string;
  position: number;
}
export interface OrderEntry {
  id: number;
  position: number;
}
export interface MediaOrderPayload {
  ownerType: MediaOwnerType;
  ownerSlug: string;
  items: OrderEntry[];
}
export interface MediaVariant {
  field: 'small' | 'medium' | 'large';
  file: File;
  width: number;
  height: number;
}
export interface UploadPayload extends MediaMetadata {
  ownerType: MediaOwnerType;
  ownerSlug: string;
  variants: MediaVariant[];
}
export interface ContentUpdate {
  value: SiteContentValue;
}
export type UnknownRecord = Record<string, unknown>;
export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
