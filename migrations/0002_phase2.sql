CREATE TABLE "gpu_metrics_hourly" (
	"server_id" varchar NOT NULL,
	"gpu_index" integer NOT NULL,
	"hour" timestamp NOT NULL,
	"util_avg" real,
	"util_max" real,
	"temp_avg" real,
	"temp_max" real,
	"power_avg" real,
	"vram_avg" real,
	"samples" integer NOT NULL,
	CONSTRAINT "gpu_metrics_hourly_server_id_gpu_index_hour_pk" PRIMARY KEY("server_id","gpu_index","hour")
);
--> statement-breakpoint
CREATE TABLE "maintenance_windows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" varchar,
	"tag" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sys_metrics_hourly" (
	"server_id" varchar NOT NULL,
	"hour" timestamp NOT NULL,
	"cpu_avg" real,
	"cpu_max" real,
	"ram_avg" real,
	"disk_avg" real,
	"load1_avg" real,
	"net_rx_avg" real,
	"net_tx_avg" real,
	"samples" integer NOT NULL,
	CONSTRAINT "sys_metrics_hourly_server_id_hour_pk" PRIMARY KEY("server_id","hour")
);
--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "mem_util_percent" real;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "sm_clock_mhz" integer;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "mem_clock_mhz" integer;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "pstate" text;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "throttle_mask" bigint;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "ecc_uncorrected" integer;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "pcie_gen" integer;--> statement-breakpoint
ALTER TABLE "gpu_snapshots" ADD COLUMN "pcie_width" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "processes" jsonb;--> statement-breakpoint
ALTER TABLE "gpu_metrics_hourly" ADD CONSTRAINT "gpu_metrics_hourly_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sys_metrics_hourly" ADD CONSTRAINT "sys_metrics_hourly_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gpu_metrics_hourly_hour_idx" ON "gpu_metrics_hourly" USING btree ("hour");--> statement-breakpoint
CREATE INDEX "maintenance_windows_ends_idx" ON "maintenance_windows" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "sys_metrics_hourly_hour_idx" ON "sys_metrics_hourly" USING btree ("hour");