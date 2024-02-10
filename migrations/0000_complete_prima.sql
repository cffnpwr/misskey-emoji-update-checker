CREATE TABLE `aliases` (
	`name` text NOT NULL,
	`alias` text NOT NULL,
	PRIMARY KEY(`alias`, `name`),
	FOREIGN KEY (`name`) REFERENCES `emojis`(`name`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `emojis` (
	`name` text PRIMARY KEY NOT NULL,
	`category` text,
	`url` text NOT NULL,
	`updatedAt` integer DEFAULT (STRFTIME('%s', 'now') * 1000) NOT NULL
);
