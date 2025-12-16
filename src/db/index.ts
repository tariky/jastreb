import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

import * as schema from './schema.ts'

config()

const databasePath = process.env.DATABASE_URL || './sqlite.db'
console.log(`[DB] Connecting to database: ${databasePath}`)

const sqlite = new Database(databasePath)

// Enable foreign keys
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

// Export raw sqlite instance for direct queries if needed
export { sqlite }

// Initialize database schema if tables don't exist
function initializeDatabase() {
  try {
    // Check if users table exists
    const tableCheck = sqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='users'
    `).get()

    if (!tableCheck) {
      console.log(`[DB] Database tables not found. Creating schema...`)
      createAllTables()
      console.log('[DB] Database schema created successfully.')
    } else {
      // Log existing tables for debugging
      const tables = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all() as { name: string }[]
      console.log(`[DB] Found ${tables.length} tables: ${tables.map(t => t.name).join(', ')}`)
    }
  } catch (error) {
    console.error('[DB] Database initialization error:', error)
    throw error
  }
}

// Create all tables with correct snake_case column names
function createAllTables() {
  // ============================================================================
  // Authentication Tables
  // ============================================================================
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      google_ai_api_key TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // ============================================================================
  // WooCommerce Tables
  // ============================================================================
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS woo_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      store_url TEXT NOT NULL,
      consumer_key TEXT NOT NULL,
      consumer_secret TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_sync_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      woo_id INTEGER NOT NULL,
      connection_id INTEGER REFERENCES woo_connections(id) ON DELETE SET NULL,
      product_type TEXT DEFAULT 'simple',
      parent_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      woo_parent_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT,
      sku TEXT,
      description TEXT,
      short_description TEXT,
      price TEXT,
      regular_price TEXT,
      sale_price TEXT,
      stock_status TEXT,
      stock_quantity INTEGER,
      categories TEXT,
      tags TEXT,
      images TEXT,
      attributes TEXT,
      variant_attributes TEXT,
      permalink TEXT,
      synced_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`CREATE INDEX IF NOT EXISTS products_user_idx ON products(user_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS products_woo_idx ON products(woo_id, connection_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS products_parent_idx ON products(parent_id)`)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS product_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      local_path TEXT,
      mime_type TEXT,
      width INTEGER,
      height INTEGER,
      prompt TEXT,
      metadata TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`CREATE INDEX IF NOT EXISTS media_product_idx ON product_media(product_id)`)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id INTEGER NOT NULL REFERENCES woo_connections(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending',
      total_products INTEGER DEFAULT 0,
      processed_products INTEGER DEFAULT 0,
      created_products INTEGER DEFAULT 0,
      updated_products INTEGER DEFAULT 0,
      skipped_products INTEGER DEFAULT 0,
      only_in_stock INTEGER DEFAULT 0,
      error_message TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // ============================================================================
  // AI Chat Tables
  // ============================================================================
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      title TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      image_url TEXT,
      image_data TEXT,
      metadata TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`CREATE INDEX IF NOT EXISTS messages_session_idx ON ai_chat_messages(session_id)`)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      session_id INTEGER REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
      message_id INTEGER REFERENCES ai_chat_messages(id) ON DELETE SET NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      input TEXT,
      output TEXT,
      error_message TEXT,
      progress INTEGER DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`CREATE INDEX IF NOT EXISTS jobs_user_idx ON generation_jobs(user_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS jobs_session_idx ON generation_jobs(session_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS jobs_status_idx ON generation_jobs(status)`)
  
  // ============================================================================
  // Template Tables
  // ============================================================================
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS satori_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      width INTEGER DEFAULT 1200,
      height INTEGER DEFAULT 630,
      template TEXT NOT NULL,
      styles TEXT,
      variables TEXT,
      preview_url TEXT,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS product_template_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES satori_templates(id) ON DELETE CASCADE,
      custom_variables TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`CREATE INDEX IF NOT EXISTS assignment_product_idx ON product_template_assignments(product_id)`)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS template_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES satori_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      conditions TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // ============================================================================
  // Feed Tables
  // ============================================================================
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'facebook_commerce',
      include_all_products INTEGER DEFAULT 0,
      filters TEXT,
      column_mapping TEXT,
      last_generated_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS feed_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      custom_data TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  sqlite.exec(`CREATE INDEX IF NOT EXISTS feed_products_feed_idx ON feed_products(feed_id)`)
}

// Run initialization
initializeDatabase()
