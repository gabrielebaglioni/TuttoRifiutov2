CREATE TABLE `archive_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`code` text,
	`href` text,
	`description` text,
	`details_json` text,
	`outro` text,
	`seo_json` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_items_slug_unique` ON `archive_items` (`slug`);--> statement-breakpoint
CREATE INDEX `archive_items_position_idx` ON `archive_items` (`position`);--> statement-breakpoint
CREATE TABLE `archive_media` (
	`id` integer PRIMARY KEY NOT NULL,
	`archive_item_id` integer NOT NULL,
	`key` text NOT NULL,
	`role` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`widths_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`archive_item_id`) REFERENCES `archive_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "archive_media_role_check" CHECK("archive_media"."role" in ('cover', 'detail'))
);
--> statement-breakpoint
CREATE INDEX `archive_media_parent_position_idx` ON `archive_media` (`archive_item_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `archive_media_key_unique` ON `archive_media` (`key`);--> statement-breakpoint
CREATE TABLE `content_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_media` (
	`id` integer PRIMARY KEY NOT NULL,
	`event_id` integer NOT NULL,
	`key` text NOT NULL,
	`role` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`widths_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_media_role_check" CHECK("event_media"."role" in ('cover', 'detail'))
);
--> statement-breakpoint
CREATE INDEX `event_media_parent_position_idx` ON `event_media` (`event_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_media_key_unique` ON `event_media` (`key`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`title` text NOT NULL,
	`code` text NOT NULL,
	`summary` text,
	`meta_json` text,
	`description` text,
	`info_json` text,
	`outro` text,
	`outro_info` text,
	`seo_json` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `events_position_idx` ON `events` (`position`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY NOT NULL,
	`ip_hash` text NOT NULL,
	`attempted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_ip_time_idx` ON `login_attempts` (`ip_hash`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);
--> statement-breakpoint
PRAGMA optimize;
