/**
 * GENERATED — do not edit. Run `npm run db:web` instead.
 *
 * The same migrations the native app applies through drizzle's expo-sqlite
 * migrator, as plain SQL for the web build. Keeping one source (drizzle/*.sql)
 * is what stops the two platforms drifting into different schemas.
 */

export const WEB_MIGRATIONS: readonly { readonly tag: string; readonly statements: readonly string[] }[] = [
  {
    tag: "0000_sour_lady_mastermind",
    statements: [
      "CREATE TABLE `app_meta` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL,\n\t`updated_at` text NOT NULL\n);",
      "CREATE TABLE `capital_events` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`kind` text NOT NULL,\n\t`amount_cents` integer NOT NULL,\n\t`date` text NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text\n);",
      "CREATE INDEX `idx_capital_date` ON `capital_events` (`date`);",
      "CREATE TABLE `custom_categories` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`label` text NOT NULL,\n\t`group_name` text DEFAULT 'OTHER' NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text\n);",
      "CREATE TABLE `distributions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`amount_cents` integer NOT NULL,\n\t`date` text NOT NULL,\n\t`vehicle_id` text,\n\t`reason` text DEFAULT '' NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE INDEX `idx_distributions_date` ON `distributions` (`date`);",
      "CREATE TABLE `expenses` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`vehicle_id` text NOT NULL,\n\t`category_id` text NOT NULL,\n\t`amount_cents` integer NOT NULL,\n\t`date` text NOT NULL,\n\t`description` text DEFAULT '' NOT NULL,\n\t`paid_by` text DEFAULT 'DANIEL' NOT NULL,\n\t`from_inventory` integer DEFAULT false NOT NULL,\n\t`inventory_item_id` text,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE INDEX `idx_expenses_vehicle` ON `expenses` (`vehicle_id`);",
      "CREATE INDEX `idx_expenses_category` ON `expenses` (`category_id`);",
      "CREATE INDEX `idx_expenses_date` ON `expenses` (`date`);",
      "CREATE TABLE `fernando_entries` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`kind` text NOT NULL,\n\t`amount_cents` integer NOT NULL,\n\t`date` text NOT NULL,\n\t`source_id` text,\n\t`vehicle_id` text,\n\t`notes` text DEFAULT '' NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `uq_fernando_source` ON `fernando_entries` (`kind`,`source_id`) WHERE source_id IS NOT NULL AND deleted_at IS NULL;",
      "CREATE INDEX `idx_fernando_kind` ON `fernando_entries` (`kind`);",
      "CREATE INDEX `idx_fernando_date` ON `fernando_entries` (`date`);",
      "CREATE TABLE `inventory_items` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`category` text DEFAULT '' NOT NULL,\n\t`quantity` integer DEFAULT 0 NOT NULL,\n\t`unit_cost_cents` integer DEFAULT 0 NOT NULL,\n\t`purchase_cost_cents` integer DEFAULT 0 NOT NULL,\n\t`purchase_date` text NOT NULL,\n\t`supplier` text DEFAULT '' NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text\n);",
      "CREATE INDEX `idx_inventory_name` ON `inventory_items` (`name`);",
      "CREATE TABLE `inventory_usages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`inventory_item_id` text NOT NULL,\n\t`vehicle_id` text NOT NULL,\n\t`quantity` integer NOT NULL,\n\t`unit_cost_cents` integer NOT NULL,\n\t`date` text NOT NULL,\n\t`expense_id` text NOT NULL,\n\t`created_at` text NOT NULL,\n\t`deleted_at` text,\n\tFOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE INDEX `idx_usage_item` ON `inventory_usages` (`inventory_item_id`);",
      "CREATE INDEX `idx_usage_vehicle` ON `inventory_usages` (`vehicle_id`);",
      "CREATE TABLE `photos` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`vehicle_id` text NOT NULL,\n\t`relative_path` text NOT NULL,\n\t`caption` text DEFAULT '' NOT NULL,\n\t`is_cover` integer DEFAULT false NOT NULL,\n\t`sort_order` integer DEFAULT 0 NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE INDEX `idx_photos_vehicle` ON `photos` (`vehicle_id`);",
      "CREATE TABLE `sales` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`vehicle_id` text NOT NULL,\n\t`sale_date` text NOT NULL,\n\t`sale_price_cents` integer NOT NULL,\n\t`buyer_name` text DEFAULT '' NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL,\n\t`daniel_share_cents` integer NOT NULL,\n\t`fernando_share_cents` integer DEFAULT 0 NOT NULL,\n\t`reinvest_cents` integer DEFAULT 0 NOT NULL,\n\t`distribute_cents` integer DEFAULT 0 NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `uq_sales_active_vehicle` ON `sales` (`vehicle_id`) WHERE deleted_at IS NULL;",
      "CREATE INDEX `idx_sales_date` ON `sales` (`sale_date`);",
      "CREATE TABLE `vehicles` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`year` integer,\n\t`make` text DEFAULT '' NOT NULL,\n\t`model` text DEFAULT '' NOT NULL,\n\t`trim` text DEFAULT '' NOT NULL,\n\t`vin` text DEFAULT '' NOT NULL,\n\t`mileage_in` integer,\n\t`mileage_out` integer,\n\t`purchase_date` text NOT NULL,\n\t`sale_date` text,\n\t`type` text NOT NULL,\n\t`status` text DEFAULT 'PURCHASED' NOT NULL,\n\t`estimated_sale_price_cents` integer,\n\t`notes` text DEFAULT '' NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text\n);",
      "CREATE INDEX `idx_vehicles_status` ON `vehicles` (`status`);",
      "CREATE INDEX `idx_vehicles_type` ON `vehicles` (`type`);",
      "CREATE INDEX `idx_vehicles_purchase_date` ON `vehicles` (`purchase_date`);",
      "CREATE INDEX `idx_vehicles_vin` ON `vehicles` (`vin`);",
    ],
  },
  {
    tag: "0001_oval_pandemic",
    statements: [
      "ALTER TABLE `vehicles` ADD `color` text DEFAULT '' NOT NULL;",
    ],
  },
];
