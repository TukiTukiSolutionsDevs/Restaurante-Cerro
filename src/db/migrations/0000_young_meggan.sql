CREATE TYPE "public"."audit_actor_type" AS ENUM('staff', 'system', 'device');--> statement-breakpoint
CREATE TYPE "public"."daily_menu_status" AS ENUM('draft', 'opened', 'closed');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('starter', 'main', 'drink', 'dessert');--> statement-breakpoint
CREATE TYPE "public"."order_item_variant" AS ENUM('full_combo', 'only_starter', 'only_main', 'drink_extra', 'dessert_extra');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'in_kitchen', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('dine_in', 'takeaway');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'yape');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('cashier', 'waiter', 'admin');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" bigint,
	"action" varchar(64) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combo_config" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"daily_menu_id" bigint NOT NULL,
	"dine_in_price_cents" integer NOT NULL,
	"takeaway_price_cents" integer NOT NULL,
	"tupper_full_price_cents" integer DEFAULT 200 NOT NULL,
	"tupper_partial_price_cents" integer DEFAULT 100 NOT NULL,
	"partial_starter_price_cents" integer NOT NULL,
	"partial_main_price_cents" integer NOT NULL,
	CONSTRAINT "combo_config_daily_menu_id_unique" UNIQUE("daily_menu_id"),
	CONSTRAINT "combo_config_dine_in_positive" CHECK ("combo_config"."dine_in_price_cents" > 0),
	CONSTRAINT "combo_config_takeaway_positive" CHECK ("combo_config"."takeaway_price_cents" > 0),
	CONSTRAINT "combo_config_partial_starter_positive" CHECK ("combo_config"."partial_starter_price_cents" > 0),
	CONSTRAINT "combo_config_partial_main_positive" CHECK ("combo_config"."partial_main_price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "daily_menu" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service_date" date NOT NULL,
	"status" "daily_menu_status" DEFAULT 'draft' NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_menu_service_date_unique" UNIQUE("service_date")
);
--> statement-breakpoint
CREATE TABLE "menu_item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"daily_menu_id" bigint NOT NULL,
	"category" "item_category" NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(200),
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"price_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_price_cents_positive" CHECK ("menu_item"."price_cents" IS NULL OR "menu_item"."price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_code" varchar(4) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"order_type" "order_type" NOT NULL,
	"daily_menu_id" bigint NOT NULL,
	"table_group_id" bigint,
	"total_cents" integer NOT NULL,
	"qr_token" text NOT NULL,
	"qr_expires_at" timestamp with time zone NOT NULL,
	"qr_consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by_cashier_id" bigint,
	"payment_method" "payment_method",
	"payment_reference" varchar(32),
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" varchar(200),
	CONSTRAINT "order_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "order_total_cents_positive" CHECK ("order"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" bigint NOT NULL,
	"variant" "order_item_variant" NOT NULL,
	"with_tupper" boolean DEFAULT false NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "order_item_quantity_min" CHECK ("order_item"."quantity" >= 1),
	CONSTRAINT "order_item_unit_price_min" CHECK ("order_item"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" smallint PRIMARY KEY NOT NULL,
	"kitchen_device_pin_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "staff_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" varchar(256),
	"ip" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"role" "staff_role" NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"pin_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restaurant_table" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(8) NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"position_x" integer DEFAULT 0 NOT NULL,
	"position_y" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "restaurant_table_code_unique" UNIQUE("code"),
	CONSTRAINT "restaurant_table_capacity_min" CHECK ("restaurant_table"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "table_group" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "table_group_member" (
	"table_group_id" bigint NOT NULL,
	"table_id" bigint NOT NULL,
	CONSTRAINT "table_group_member_table_group_id_table_id_pk" PRIMARY KEY("table_group_id","table_id")
);
--> statement-breakpoint
ALTER TABLE "combo_config" ADD CONSTRAINT "combo_config_daily_menu_id_daily_menu_id_fk" FOREIGN KEY ("daily_menu_id") REFERENCES "public"."daily_menu"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_daily_menu_id_daily_menu_id_fk" FOREIGN KEY ("daily_menu_id") REFERENCES "public"."daily_menu"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_daily_menu_id_daily_menu_id_fk" FOREIGN KEY ("daily_menu_id") REFERENCES "public"."daily_menu"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_table_group_id_table_group_id_fk" FOREIGN KEY ("table_group_id") REFERENCES "public"."table_group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_paid_by_cashier_id_staff_user_id_fk" FOREIGN KEY ("paid_by_cashier_id") REFERENCES "public"."staff_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_session" ADD CONSTRAINT "staff_session_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_group_member" ADD CONSTRAINT "table_group_member_table_group_id_table_group_id_fk" FOREIGN KEY ("table_group_id") REFERENCES "public"."table_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_group_member" ADD CONSTRAINT "table_group_member_table_id_restaurant_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_table"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "menu_item_daily_menu_sort_idx" ON "menu_item" USING btree ("daily_menu_id","sort_order");--> statement-breakpoint
CREATE INDEX "order_short_code_idx" ON "order" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "order_status_created_at_idx" ON "order" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_table_group_status_idx" ON "order" USING btree ("table_group_id","status");--> statement-breakpoint
CREATE INDEX "staff_session_expires_at_idx" ON "staff_session" USING btree ("expires_at");