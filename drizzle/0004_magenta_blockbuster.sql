ALTER TABLE `archive_items` ADD `deleting` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `archive_media` ADD `reservation_started_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `archive_media` SET `reservation_started_at` = `created_at` WHERE `state` = 'pending' AND `reservation_started_at` = 0;--> statement-breakpoint
ALTER TABLE `event_media` ADD `reservation_started_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `event_media` SET `reservation_started_at` = `created_at` WHERE `state` = 'pending' AND `reservation_started_at` = 0;--> statement-breakpoint
ALTER TABLE `events` ADD `deleting` integer DEFAULT false NOT NULL;--> statement-breakpoint
PRAGMA optimize;
