CREATE TABLE `usages` (
	`id` integer PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`experiment` integer NOT NULL,
	`message` integer NOT NULL,
	`agent` integer NOT NULL,
	`input_tokens` integer DEFAULT 1 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`experiment`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
