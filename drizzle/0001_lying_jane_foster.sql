PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_archive_media` (
	`id` integer PRIMARY KEY NOT NULL,
	`archive_item_id` integer NOT NULL,
	`key` text NOT NULL,
	`role` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`widths_json` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`cleanup_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`archive_item_id`) REFERENCES `archive_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "archive_media_role_check" CHECK("__new_archive_media"."role" in ('cover', 'detail')),
	CONSTRAINT "archive_media_state_check" CHECK("__new_archive_media"."state" in ('active', 'tombstone'))
);
--> statement-breakpoint
INSERT INTO `__new_archive_media`("id", "archive_item_id", "key", "role", "alt", "position", "widths_json", "state", "cleanup_attempts", "created_at")
SELECT legacy.id, legacy.archive_item_id, legacy.key, legacy.role, legacy.alt, legacy.position, legacy.widths_json,
	CASE WHEN EXISTS (
		SELECT 1 FROM archive_media AS prior
		WHERE prior.archive_item_id = legacy.archive_item_id
			AND prior.role = legacy.role
			AND prior.position = legacy.position
			AND (prior.created_at < legacy.created_at OR (prior.created_at = legacy.created_at AND prior.id < legacy.id))
	) THEN 'tombstone' ELSE 'active' END,
	CASE WHEN EXISTS (
		SELECT 1 FROM archive_media AS prior
		WHERE prior.archive_item_id = legacy.archive_item_id
			AND prior.role = legacy.role
			AND prior.position = legacy.position
			AND (prior.created_at < legacy.created_at OR (prior.created_at = legacy.created_at AND prior.id < legacy.id))
	) THEN 1 ELSE 0 END,
	legacy.created_at
FROM archive_media AS legacy;--> statement-breakpoint
DROP TABLE `archive_media`;--> statement-breakpoint
ALTER TABLE `__new_archive_media` RENAME TO `archive_media`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `archive_media_parent_position_idx` ON `archive_media` (`archive_item_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `archive_media_active_slot_unique` ON `archive_media` (`archive_item_id`,`role`,`position`) WHERE "archive_media"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `archive_media_key_unique` ON `archive_media` (`key`);--> statement-breakpoint
CREATE TABLE `__new_event_media` (
	`id` integer PRIMARY KEY NOT NULL,
	`event_id` integer NOT NULL,
	`key` text NOT NULL,
	`role` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`widths_json` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`cleanup_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_media_role_check" CHECK("__new_event_media"."role" in ('cover', 'detail')),
	CONSTRAINT "event_media_state_check" CHECK("__new_event_media"."state" in ('active', 'tombstone'))
);
--> statement-breakpoint
INSERT INTO `__new_event_media`("id", "event_id", "key", "role", "alt", "position", "widths_json", "state", "cleanup_attempts", "created_at")
SELECT legacy.id, legacy.event_id, legacy.key, legacy.role, legacy.alt, legacy.position, legacy.widths_json,
	CASE WHEN EXISTS (
		SELECT 1 FROM event_media AS prior
		WHERE prior.event_id = legacy.event_id
			AND prior.role = legacy.role
			AND prior.position = legacy.position
			AND (prior.created_at < legacy.created_at OR (prior.created_at = legacy.created_at AND prior.id < legacy.id))
	) THEN 'tombstone' ELSE 'active' END,
	CASE WHEN EXISTS (
		SELECT 1 FROM event_media AS prior
		WHERE prior.event_id = legacy.event_id
			AND prior.role = legacy.role
			AND prior.position = legacy.position
			AND (prior.created_at < legacy.created_at OR (prior.created_at = legacy.created_at AND prior.id < legacy.id))
	) THEN 1 ELSE 0 END,
	legacy.created_at
FROM event_media AS legacy;--> statement-breakpoint
DROP TABLE `event_media`;--> statement-breakpoint
ALTER TABLE `__new_event_media` RENAME TO `event_media`;--> statement-breakpoint
CREATE INDEX `event_media_parent_position_idx` ON `event_media` (`event_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_media_active_slot_unique` ON `event_media` (`event_id`,`role`,`position`) WHERE "event_media"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `event_media_key_unique` ON `event_media` (`key`);
--> statement-breakpoint
PRAGMA optimize;
