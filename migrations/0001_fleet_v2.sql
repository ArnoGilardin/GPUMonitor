ALTER TABLE "servers" ALTER COLUMN "last_seen_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sys_snapshots" ALTER COLUMN "load1" SET DATA TYPE numeric(7, 2);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "value" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "acknowledged_at" timestamp;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "acknowledged_by" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "uuid" text;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "server_id" varchar;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "tag" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "api_key_hash" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "api_key_prefix" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "maintenance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "hostname" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "os" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cpu_model" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cpu_cores" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "collector_version" text;--> statement-breakpoint
ALTER TABLE "sys_snapshots" ADD COLUMN "load5" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "sys_snapshots" ADD COLUMN "load15" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "sys_snapshots" ADD COLUMN "ram_used_mb" integer;--> statement-breakpoint
ALTER TABLE "sys_snapshots" ADD COLUMN "ram_total_mb" integer;--> statement-breakpoint
ALTER TABLE "sys_snapshots" ADD COLUMN "disk_used_gb" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sys_snapshots" ADD COLUMN "disk_total_gb" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sys_snapshots" ADD COLUMN "net_rx_bps" bigint;--> statement-breakpoint
ALTER TABLE "sys_snapshots" ADD COLUMN "net_tx_bps" bigint;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_server_rule_idx" ON "alerts" USING btree ("server_id","rule_id");--> statement-breakpoint
CREATE INDEX "gpu_snapshots_server_ts_idx" ON "gpu_snapshots" USING btree ("server_id","ts");--> statement-breakpoint
CREATE INDEX "sys_snapshots_server_ts_idx" ON "sys_snapshots" USING btree ("server_id","ts");