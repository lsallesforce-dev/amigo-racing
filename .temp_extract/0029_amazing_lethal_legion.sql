DROP TABLE `categories`;--> statement-breakpoint
DROP TABLE `emailNotifications`;--> statement-breakpoint
DROP TABLE `event_images`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
DROP TABLE `organizerRequests`;--> statement-breakpoint
DROP TABLE `organizers`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
DROP TABLE `registration_history`;--> statement-breakpoint
DROP TABLE `registrations`;--> statement-breakpoint
DROP TABLE `start_order_config`;--> statement-breakpoint
DROP TABLE `vehicles`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `phone`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `recipientId`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `pixKey`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankDocument`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankCode`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankAgency`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankAgencyDv`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankAccount`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankAccountDv`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankAccountType`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankHolderName`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `bankHolderDocument`;