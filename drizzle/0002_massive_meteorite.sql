ALTER TABLE `archive_media` ADD `sources_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `event_media` ADD `sources_json` text DEFAULT '[]' NOT NULL;