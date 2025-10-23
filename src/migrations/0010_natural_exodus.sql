CREATE TABLE `scripts` (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`edited` integer NOT NULL,
	`author` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`experiment` integer NOT NULL,
	FOREIGN KEY (`experiment`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scripts_name_author_unique` ON `scripts` (`name`,`author`);--> statement-breakpoint
ALTER TABLE `publications` ADD `script` integer REFERENCES scripts(id);