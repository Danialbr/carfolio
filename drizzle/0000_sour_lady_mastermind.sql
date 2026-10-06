CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `capital_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_capital_date` ON `capital_events` (`date`);--> statement-breakpoint
CREATE TABLE `custom_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`group_name` text DEFAULT 'OTHER' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `distributions` (
	`id` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`vehicle_id` text,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_distributions_date` ON `distributions` (`date`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`paid_by` text DEFAULT 'DANIEL' NOT NULL,
	`from_inventory` integer DEFAULT false NOT NULL,
	`inventory_item_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_vehicle` ON `expenses` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `idx_expenses_category` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_expenses_date` ON `expenses` (`date`);--> statement-breakpoint
CREATE TABLE `fernando_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`source_id` text,
	`vehicle_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fernando_source` ON `fernando_entries` (`kind`,`source_id`) WHERE source_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_fernando_kind` ON `fernando_entries` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_fernando_date` ON `fernando_entries` (`date`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`purchase_cost_cents` integer DEFAULT 0 NOT NULL,
	`purchase_date` text NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_name` ON `inventory_items` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_usages` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_item_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost_cents` integer NOT NULL,
	`date` text NOT NULL,
	`expense_id` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_usage_item` ON `inventory_usages` (`inventory_item_id`);--> statement-breakpoint
CREATE INDEX `idx_usage_vehicle` ON `inventory_usages` (`vehicle_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`relative_path` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`is_cover` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_photos_vehicle` ON `photos` (`vehicle_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`sale_date` text NOT NULL,
	`sale_price_cents` integer NOT NULL,
	`buyer_name` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`daniel_share_cents` integer NOT NULL,
	`fernando_share_cents` integer DEFAULT 0 NOT NULL,
	`reinvest_cents` integer DEFAULT 0 NOT NULL,
	`distribute_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sales_active_vehicle` ON `sales` (`vehicle_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_sales_date` ON `sales` (`sale_date`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer,
	`make` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`trim` text DEFAULT '' NOT NULL,
	`vin` text DEFAULT '' NOT NULL,
	`mileage_in` integer,
	`mileage_out` integer,
	`purchase_date` text NOT NULL,
	`sale_date` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'PURCHASED' NOT NULL,
	`estimated_sale_price_cents` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_vehicles_status` ON `vehicles` (`status`);--> statement-breakpoint
CREATE INDEX `idx_vehicles_type` ON `vehicles` (`type`);--> statement-breakpoint
CREATE INDEX `idx_vehicles_purchase_date` ON `vehicles` (`purchase_date`);--> statement-breakpoint
CREATE INDEX `idx_vehicles_vin` ON `vehicles` (`vin`);