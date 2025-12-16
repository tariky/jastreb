import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ============================================================================
// Authentication
// ============================================================================

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  googleAiApiKey: text('google_ai_api_key'), // User's own Google AI API key (optional)
  isAdmin: integer('is_admin', { mode: 'boolean' }).default(false), // Admin users can create other users
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ============================================================================
// WooCommerce Connections
// ============================================================================

export const wooConnections = sqliteTable('woo_connections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  storeUrl: text('store_url').notNull(),
  consumerKey: text('consumer_key').notNull(),
  consumerSecret: text('consumer_secret').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ============================================================================
// Products (synced from WooCommerce)
// ============================================================================

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  wooId: integer('woo_id').notNull(),
  connectionId: integer('connection_id').references(() => wooConnections.id, { onDelete: 'set null' }),
  // Product type: simple, variable, variation, grouped, external
  productType: text('product_type').default('simple').$type<'simple' | 'variable' | 'variation' | 'grouped' | 'external'>(),
  // Parent product ID for variations (references local product id)
  parentId: integer('parent_id').references((): any => products.id, { onDelete: 'cascade' }),
  // WooCommerce parent ID (for syncing)
  wooParentId: integer('woo_parent_id'),
  name: text('name').notNull(),
  slug: text('slug'),
  sku: text('sku'),
  description: text('description'),
  shortDescription: text('short_description'),
  price: text('price'),
  regularPrice: text('regular_price'),
  salePrice: text('sale_price'),
  stockStatus: text('stock_status'),
  stockQuantity: integer('stock_quantity'),
  categories: text('categories', { mode: 'json' }).$type<string[]>(),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  images: text('images', { mode: 'json' }).$type<{ src: string; alt: string }[]>(),
  // Product attributes (for variable products: available options)
  attributes: text('attributes', { mode: 'json' }).$type<{ name: string; options: string[]; variation?: boolean }[]>(),
  // Variant attributes (for variations: selected values)
  variantAttributes: text('variant_attributes', { mode: 'json' }).$type<{ name: string; option: string }[]>(),
  permalink: text('permalink'),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('products_user_idx').on(table.userId),
  index('products_woo_idx').on(table.wooId, table.connectionId),
  index('products_parent_idx').on(table.parentId),
])

// ============================================================================
// Product Media (generated images + uploaded videos)
// ============================================================================

export const productMedia = sqliteTable('product_media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  type: text('type').notNull().$type<'image' | 'video' | 'satori'>(),
  source: text('source').notNull().$type<'woocommerce' | 'gemini' | 'upload' | 'satori'>(),
  url: text('url').notNull(),
  localPath: text('local_path'),
  mimeType: text('mime_type'),
  width: integer('width'),
  height: integer('height'),
  prompt: text('prompt'), // For AI-generated images
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('media_product_idx').on(table.productId),
])

// ============================================================================
// AI Chat Sessions (for multi-turn image editing)
// ============================================================================

export const aiChatSessions = sqliteTable('ai_chat_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  title: text('title'),
  status: text('status').default('active').$type<'active' | 'archived'>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

export const aiChatMessages = sqliteTable('ai_chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => aiChatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull().$type<'user' | 'assistant'>(),
  content: text('content'), // Text content
  imageUrl: text('image_url'), // Generated or uploaded image
  imageData: text('image_data'), // Base64 for reference images
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('messages_session_idx').on(table.sessionId),
])

// ============================================================================
// Satori Templates
// ============================================================================

export const satoriTemplates = sqliteTable('satori_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  width: integer('width').default(1200),
  height: integer('height').default(630),
  template: text('template').notNull(), // JSX-like template or React component string
  styles: text('styles', { mode: 'json' }).$type<Record<string, unknown>>(),
  variables: text('variables', { mode: 'json' }).$type<string[]>(), // Available placeholders
  previewUrl: text('preview_url'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ============================================================================
// Product-Template Assignments
// ============================================================================

export const productTemplateAssignments = sqliteTable('product_template_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').notNull().references(() => satoriTemplates.id, { onDelete: 'cascade' }),
  customVariables: text('custom_variables', { mode: 'json' }).$type<Record<string, string>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('assignment_product_idx').on(table.productId),
])

// ============================================================================
// Template Rules (Auto-assign templates based on conditions)
// ============================================================================

export const templateRules = sqliteTable('template_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').notNull().references(() => satoriTemplates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  priority: integer('priority').default(0), // Higher priority rules are checked first
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  // Rule conditions - all must match (AND logic)
  conditions: text('conditions', { mode: 'json' }).$type<{
    categories?: string[] // Match any of these categories
    tags?: string[] // Match any of these tags
    priceMin?: number // Minimum price
    priceMax?: number // Maximum price
    stockStatus?: ('instock' | 'outofstock' | 'onbackorder')[]
    productType?: ('simple' | 'variable' | 'variation')[]
    skuPattern?: string // Regex pattern for SKU
    namePattern?: string // Regex pattern for name
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ============================================================================
// Facebook Commerce Feeds
// ============================================================================

export const feeds = sqliteTable('feeds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').default('facebook_commerce').$type<'facebook_commerce' | 'google_merchant'>(),
  includeAllProducts: integer('include_all_products', { mode: 'boolean' }).default(false),
  filters: text('filters', { mode: 'json' }).$type<{
    categories?: string[]
    tags?: string[]
    stockStatus?: string[]
  }>(),
  columnMapping: text('column_mapping', { mode: 'json' }).$type<Record<string, string>>(),
  lastGeneratedAt: integer('last_generated_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ============================================================================
// Feed Products (for selective feeds)
// ============================================================================

export const feedProducts = sqliteTable('feed_products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feedId: integer('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  customData: text('custom_data', { mode: 'json' }).$type<Record<string, string>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('feed_products_feed_idx').on(table.feedId),
])

// ============================================================================
// Sync Jobs (track WooCommerce sync progress)
// ============================================================================

export const syncJobs = sqliteTable('sync_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  connectionId: integer('connection_id').notNull().references(() => wooConnections.id, { onDelete: 'cascade' }),
  status: text('status').default('pending').$type<'pending' | 'fetching' | 'processing' | 'completed' | 'failed'>(),
  totalProducts: integer('total_products').default(0),
  processedProducts: integer('processed_products').default(0),
  createdProducts: integer('created_products').default(0),
  updatedProducts: integer('updated_products').default(0),
  skippedProducts: integer('skipped_products').default(0),
  onlyInStock: integer('only_in_stock', { mode: 'boolean' }).default(false),
  errorMessage: text('error_message'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ============================================================================
// Generation Jobs (track async operations)
// ============================================================================

export const generationJobs = sqliteTable('generation_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull().$type<'gemini' | 'satori' | 'feed'>(),
  status: text('status').default('pending').$type<'pending' | 'processing' | 'completed' | 'failed'>(),
  sessionId: integer('session_id').references(() => aiChatSessions.id, { onDelete: 'cascade' }),
  messageId: integer('message_id').references(() => aiChatMessages.id, { onDelete: 'set null' }), // User message ID
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  input: text('input', { mode: 'json' }).$type<Record<string, unknown>>(),
  output: text('output', { mode: 'json' }).$type<Record<string, unknown>>(),
  errorMessage: text('error_message'),
  progress: integer('progress').default(0), // 0-100
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => [
  index('jobs_user_idx').on(table.userId),
  index('jobs_session_idx').on(table.sessionId),
  index('jobs_status_idx').on(table.status),
])

// ============================================================================
// Type Exports
// ============================================================================

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type WooConnection = typeof wooConnections.$inferSelect
export type Product = typeof products.$inferSelect
export type ProductMedia = typeof productMedia.$inferSelect
export type AiChatSession = typeof aiChatSessions.$inferSelect
export type AiChatMessage = typeof aiChatMessages.$inferSelect
export type SatoriTemplate = typeof satoriTemplates.$inferSelect
export type TemplateRule = typeof templateRules.$inferSelect
export type ProductTemplateAssignment = typeof productTemplateAssignments.$inferSelect
export type Feed = typeof feeds.$inferSelect
export type FeedProduct = typeof feedProducts.$inferSelect
export type SyncJob = typeof syncJobs.$inferSelect
export type GenerationJob = typeof generationJobs.$inferSelect
