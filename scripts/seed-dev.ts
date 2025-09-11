#!/usr/bin/env tsx
/**
 * GPU & Server Monitor - Development Seed Script
 * 
 * Creates admin user with admin/admin credentials for development.
 * Only runs in NODE_ENV=development with ALLOW_DEMO_SEED=true
 */

import bcrypt from "bcrypt";
import { storage } from "../server/storage";

async function seedDev() {
  const nodeEnv = process.env.NODE_ENV;
  const allowDemoSeed = process.env.ALLOW_DEMO_SEED;

  console.log(`Environment: ${nodeEnv}`);
  console.log(`Allow demo seed: ${allowDemoSeed}`);

  if (nodeEnv !== "development") {
    console.error("❌ Seed script only runs in NODE_ENV=development");
    process.exit(1);
  }

  if (allowDemoSeed !== "true") {
    console.error("❌ Set ALLOW_DEMO_SEED=true to enable demo seeding");
    process.exit(1);
  }

  try {
    console.log("🌱 Starting development seed...");

    // Check if admin user already exists
    const existingAdmin = await storage.getUserByUsername("admin");
    if (existingAdmin) {
      console.log("✅ Admin user already exists, skipping creation");
      return;
    }

    // Create admin user
    const adminPassword = "admin";
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const adminUser = await storage.createUser({
      username: "admin",
      passwordHash: hashedPassword,
      role: "admin"
    });

    console.log(`✅ Created admin user with ID: ${adminUser.id}`);
    console.log("📋 Demo credentials: admin/admin");
    console.log("🔒 Password is properly bcrypt-hashed");
    
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

// Run seed if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDev().then(() => {
    console.log("🎉 Development seed completed successfully");
    process.exit(0);
  }).catch((error) => {
    console.error("💥 Seed failed:", error);
    process.exit(1);
  });
}

export { seedDev };