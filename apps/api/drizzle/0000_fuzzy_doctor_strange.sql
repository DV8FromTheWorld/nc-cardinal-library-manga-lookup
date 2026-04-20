CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_token` text NOT NULL,
	`logged_in` integer DEFAULT false NOT NULL,
	`user_id` text,
	`barcode` text,
	`display_name` text,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cache_entries` (
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`namespace`, `key`, `version`)
);
--> statement-breakpoint
CREATE INDEX `cache_expires_at_idx` ON `cache_entries` (`expires_at`);--> statement-breakpoint
CREATE TABLE `edition_volumes` (
	`edition_id` text NOT NULL,
	`volume_id` text NOT NULL,
	PRIMARY KEY(`edition_id`, `volume_id`),
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `editions` (
	`id` text PRIMARY KEY NOT NULL,
	`isbn` text NOT NULL,
	`format` text NOT NULL,
	`language` text NOT NULL,
	`release_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editions_isbn_unique` ON `editions` (`isbn`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`media_type` text NOT NULL,
	`author` text,
	`artist` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`description` text,
	`parent_series_id` text,
	`relationship` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `series_external_ids` (
	`series_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	PRIMARY KEY(`series_id`, `source`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `external_ids_source_idx` ON `series_external_ids` (`source`,`external_id`);--> statement-breakpoint
CREATE TABLE `series_relations` (
	`series_id` text NOT NULL,
	`related_series_id` text NOT NULL,
	PRIMARY KEY(`series_id`, `related_series_id`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `title_index` (
	`normalized_title` text NOT NULL,
	`series_id` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `title_index_normalized_title_unique` ON `title_index` (`normalized_title`);--> statement-breakpoint
CREATE TABLE `volumes` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`volume_number` integer NOT NULL,
	`title` text,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
