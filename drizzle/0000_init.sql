CREATE TABLE "limits" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"total_usd_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "limits_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"package_id" text,
	"package_label" text,
	"value" text,
	"currency" text,
	"recipient_phone_enc" text,
	"recipient_last4" text,
	"recipient_calling_code" text,
	"esim_id" text,
	"provider" text NOT NULL,
	"provider_invoice_id" text,
	"provider_order_id" text,
	"bolt11" text,
	"invoice_expires_at" timestamp with time zone,
	"price_sats" bigint,
	"price_usd_cents" integer,
	"nimiq_tx_hash" text,
	"swap_id" text,
	"payment_attempted_at" timestamp with time zone,
	"status" text NOT NULL,
	"failure_reason" text,
	"redemption_json_enc" text,
	"request_id" text,
	"receipt_token" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"requester_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"package_id" text,
	"package_label" text,
	"value" text,
	"currency" text,
	"recipient_phone_enc" text NOT NULL,
	"recipient_last4" text NOT NULL,
	"recipient_calling_code" text NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"order_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_numbers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"nickname" text NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_last4" text NOT NULL,
	"calling_code" text NOT NULL,
	"country" text NOT NULL,
	"operator_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"nonce" text,
	"message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"nim_address" text NOT NULL,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "limits" ADD CONSTRAINT "limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_numbers" ADD CONSTRAINT "saved_numbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_invoice_idx" ON "orders" USING btree ("provider_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_receipt_idx" ON "orders" USING btree ("receipt_token");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_code_idx" ON "requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "requests_requester_idx" ON "requests" USING btree ("requester_user_id");--> statement-breakpoint
CREATE INDEX "saved_numbers_user_idx" ON "saved_numbers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_nim_address_idx" ON "users" USING btree ("nim_address");