import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const contentEntries = sqliteTable("content_entries", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("published"),
  title: text("title").notNull(),
  code: text("code").notNull(),
  summary: text("summary"),
  metaJson: text("meta_json"),
  description: text("description"),
  infoJson: text("info_json"),
  outro: text("outro"),
  outroInfo: text("outro_info"),
  seoJson: text("seo_json"),
  position: integer("position").notNull().default(0),
  deleting: integer("deleting", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("events_slug_unique").on(table.slug),
  index("events_position_idx").on(table.position),
]);

export const eventMedia = sqliteTable("event_media", {
  id: integer("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  role: text("role", { enum: ["cover", "detail"] }).notNull(),
  alt: text("alt").notNull().default(""),
  position: integer("position").notNull().default(0),
  widthsJson: text("widths_json").notNull(),
  sourcesJson: text("sources_json").notNull().default("[]"),
  state: text("state", { enum: ["active", "tombstone", "pending", "pending_cleanup"] }).notNull().default("active"),
  cleanupAttempts: integer("cleanup_attempts").notNull().default(0),
  reservationStartedAt: integer("reservation_started_at").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  check("event_media_role_check", sql`${table.role} in ('cover', 'detail')`),
  check("event_media_cover_position_check", sql`(${table.role} = 'cover' AND ${table.position} = 0) OR (${table.role} = 'detail' AND ${table.position} >= 0)`),
  check("event_media_state_check", sql`${table.state} in ('active', 'tombstone', 'pending', 'pending_cleanup')`),
  index("event_media_parent_position_idx").on(table.eventId, table.position),
  uniqueIndex("event_media_active_slot_unique").on(table.eventId, table.role, table.position).where(sql`${table.state} = 'active'`),
  uniqueIndex("event_media_key_unique").on(table.key),
]);

export const archiveItems = sqliteTable("archive_items", {
  id: integer("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  code: text("code"),
  href: text("href"),
  description: text("description"),
  detailsJson: text("details_json"),
  outro: text("outro"),
  seoJson: text("seo_json"),
  position: integer("position").notNull().default(0),
  deleting: integer("deleting", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("archive_items_slug_unique").on(table.slug),
  index("archive_items_position_idx").on(table.position),
]);

export const archiveMedia = sqliteTable("archive_media", {
  id: integer("id").primaryKey(),
  archiveItemId: integer("archive_item_id").notNull().references(() => archiveItems.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  role: text("role", { enum: ["cover", "detail"] }).notNull(),
  alt: text("alt").notNull().default(""),
  position: integer("position").notNull().default(0),
  widthsJson: text("widths_json").notNull(),
  sourcesJson: text("sources_json").notNull().default("[]"),
  state: text("state", { enum: ["active", "tombstone", "pending", "pending_cleanup"] }).notNull().default("active"),
  cleanupAttempts: integer("cleanup_attempts").notNull().default(0),
  reservationStartedAt: integer("reservation_started_at").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  check("archive_media_role_check", sql`${table.role} in ('cover', 'detail')`),
  check("archive_media_cover_position_check", sql`(${table.role} = 'cover' AND ${table.position} = 0) OR (${table.role} = 'detail' AND ${table.position} >= 0)`),
  check("archive_media_state_check", sql`${table.state} in ('active', 'tombstone', 'pending', 'pending_cleanup')`),
  index("archive_media_parent_position_idx").on(table.archiveItemId, table.position),
  uniqueIndex("archive_media_active_slot_unique").on(table.archiveItemId, table.role, table.position).where(sql`${table.state} = 'active'`),
  uniqueIndex("archive_media_key_unique").on(table.key),
]);

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
  index("sessions_expiry_idx").on(table.expiresAt),
]);

export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey(),
  ipHash: text("ip_hash").notNull(),
  attemptedAt: integer("attempted_at").notNull(),
}, (table) => [
  index("login_attempts_ip_time_idx").on(table.ipHash, table.attemptedAt),
]);
