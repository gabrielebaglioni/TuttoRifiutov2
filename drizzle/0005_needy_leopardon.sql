PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_archive_media` (
	`id` integer PRIMARY KEY NOT NULL,
	`archive_item_id` integer NOT NULL,
	`key` text NOT NULL,
	`role` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`widths_json` text NOT NULL,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`cleanup_attempts` integer DEFAULT 0 NOT NULL,
	`reservation_started_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`archive_item_id`) REFERENCES `archive_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "archive_media_role_check" CHECK("__new_archive_media"."role" in ('cover', 'detail')),
	CONSTRAINT "archive_media_cover_position_check" CHECK(("__new_archive_media"."role" = 'cover' AND "__new_archive_media"."position" = 0) OR ("__new_archive_media"."role" = 'detail' AND "__new_archive_media"."position" >= 0)),
	CONSTRAINT "archive_media_state_check" CHECK("__new_archive_media"."state" in ('active', 'tombstone', 'pending', 'pending_cleanup'))
);
--> statement-breakpoint
INSERT INTO `__new_archive_media`("id", "archive_item_id", "key", "role", "alt", "position", "widths_json", "sources_json", "state", "cleanup_attempts", "reservation_started_at", "created_at")
SELECT old.id, old.archive_item_id, old.key, old.role, old.alt, old.next_position, old.widths_json, old.sources_json,
  CASE WHEN old.duplicate_loser = 1 THEN 'tombstone' ELSE old.state END,
  old.cleanup_attempts + old.duplicate_loser, old.reservation_started_at, old.created_at
FROM (
  SELECT legacy.*,
    CASE WHEN legacy.role = 'cover' THEN 0 WHEN legacy.position < 0 THEN 0 ELSE legacy.position END AS next_position,
    CASE WHEN legacy.state = 'active' AND EXISTS (
      SELECT 1 FROM archive_media AS prior
      WHERE prior.archive_item_id = legacy.archive_item_id
        AND prior.state = 'active'
        AND prior.role = legacy.role
        AND (CASE WHEN prior.role = 'cover' THEN 0 WHEN prior.position < 0 THEN 0 ELSE prior.position END)
          = (CASE WHEN legacy.role = 'cover' THEN 0 WHEN legacy.position < 0 THEN 0 ELSE legacy.position END)
        AND (prior.created_at < legacy.created_at OR (prior.created_at = legacy.created_at AND prior.id < legacy.id))
    ) THEN 1 ELSE 0 END AS duplicate_loser
  FROM archive_media AS legacy
) AS old;--> statement-breakpoint
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
	`sources_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`cleanup_attempts` integer DEFAULT 0 NOT NULL,
	`reservation_started_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_media_role_check" CHECK("__new_event_media"."role" in ('cover', 'detail')),
	CONSTRAINT "event_media_cover_position_check" CHECK(("__new_event_media"."role" = 'cover' AND "__new_event_media"."position" = 0) OR ("__new_event_media"."role" = 'detail' AND "__new_event_media"."position" >= 0)),
	CONSTRAINT "event_media_state_check" CHECK("__new_event_media"."state" in ('active', 'tombstone', 'pending', 'pending_cleanup'))
);
--> statement-breakpoint
INSERT INTO `__new_event_media`("id", "event_id", "key", "role", "alt", "position", "widths_json", "sources_json", "state", "cleanup_attempts", "reservation_started_at", "created_at")
SELECT old.id, old.event_id, old.key, old.role, old.alt, old.next_position, old.widths_json, old.sources_json,
  CASE WHEN old.duplicate_loser = 1 THEN 'tombstone' ELSE old.state END,
  old.cleanup_attempts + old.duplicate_loser, old.reservation_started_at, old.created_at
FROM (
  SELECT legacy.*,
    CASE WHEN legacy.role = 'cover' THEN 0 WHEN legacy.position < 0 THEN 0 ELSE legacy.position END AS next_position,
    CASE WHEN legacy.state = 'active' AND EXISTS (
      SELECT 1 FROM event_media AS prior
      WHERE prior.event_id = legacy.event_id
        AND prior.state = 'active'
        AND prior.role = legacy.role
        AND (CASE WHEN prior.role = 'cover' THEN 0 WHEN prior.position < 0 THEN 0 ELSE prior.position END)
          = (CASE WHEN legacy.role = 'cover' THEN 0 WHEN legacy.position < 0 THEN 0 ELSE legacy.position END)
        AND (prior.created_at < legacy.created_at OR (prior.created_at = legacy.created_at AND prior.id < legacy.id))
    ) THEN 1 ELSE 0 END AS duplicate_loser
  FROM event_media AS legacy
) AS old;--> statement-breakpoint
DROP TABLE `event_media`;--> statement-breakpoint
ALTER TABLE `__new_event_media` RENAME TO `event_media`;--> statement-breakpoint
CREATE INDEX `event_media_parent_position_idx` ON `event_media` (`event_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_media_active_slot_unique` ON `event_media` (`event_id`,`role`,`position`) WHERE "event_media"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `event_media_key_unique` ON `event_media` (`key`);
