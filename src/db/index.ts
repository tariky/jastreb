import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

import * as schema from './schema.ts'

config()

const sqlite = new Database(process.env.DATABASE_URL || './sqlite.db')
export const db = drizzle(sqlite, { schema })

// Initialize database schema if tables don't exist
function initializeDatabase() {
  try {
    // Check if users table exists
    const tableCheck = sqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='users'
    `).get()

    if (!tableCheck) {
      console.log('Database tables not found. Initializing schema...')
      pushSchema()
    }
  } catch (error) {
    console.error('Database initialization error:', error)
    // Try to push schema as fallback
    try {
      pushSchema()
    } catch (pushError) {
      console.error('Schema push also failed:', pushError)
      throw pushError
    }
  }
}

// Push schema directly (creates tables from schema definitions)
function pushSchema() {
  const { sql } = db
  
  // Enable foreign keys
  sqlite.prepare('PRAGMA foreign_keys = ON').run()
  
  // Create users table
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
  
  // Create sessions table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // Create woo_connections table
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
  
  // Create products table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      woo_id INTEGER NOT NULL,
      connection_id INTEGER REFERENCES woo_connections(id) ON DELETE SET NULL,
      parent_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      slug TEXT,
      description TEXT,
      short_description TEXT,
      sku TEXT,
      price REAL,
      regular_price REAL,
      sale_price REAL,
      stock_status TEXT,
      stock_quantity INTEGER,
      manage_stock INTEGER DEFAULT 0,
      weight REAL,
      length REAL,
      width REAL,
      height REAL,
      default_image_url TEXT,
      default_video_url TEXT,
      status TEXT DEFAULT 'publish',
      type TEXT DEFAULT 'simple',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // Create indexes for products
  sqlite.exec(`CREATE INDEX IF NOT EXISTS products_user_idx ON products(user_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS products_woo_idx ON products(woo_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS products_connection_idx ON products(connection_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS products_parent_idx ON products(parent_id)`)
  
  // Create product_media table
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
  
  // Create templates table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      template TEXT NOT NULL,
      defaultImageUrl TEXT,
      backgroundColor TEXT,
      demoProductId INTEGER REFERENCES products(id) ON DELETE SET NULL,
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // Create template_rules table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS template_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      templateId INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      ruleType TEXT NOT NULL,
      ruleValue TEXT NOT NULL,
      createdAt INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // Create template_products table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS template_products (
      templateId INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      PRIMARY KEY (templateId, productId)
    )
  `)
  
  // Create feeds table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // Create feed_products table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS feed_products (
      feedId INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      PRIMARY KEY (feedId, productId)
    )
  `)
  
  // Create ai_chat_sessions table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      productId INTEGER REFERENCES products(id) ON DELETE SET NULL,
      title TEXT,
      status TEXT DEFAULT 'active',
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // Create ai_chat_messages table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      imageUrl TEXT,
      imageData TEXT,
      metadata TEXT,
      createdAt INTEGER DEFAULT (unixepoch())
    )
  `)
  
  // Create generation_jobs table
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
  
  sqlite.exec(`CREATE INDEX IF NOT EXISTS generation_job_session_idx ON generation_jobs(session_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS generation_job_message_idx ON generation_jobs(message_id)`)
  
  console.log('Database schema initialized successfully.')
}

// Initialize on module load
initializeDatabase()
