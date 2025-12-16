// ============================================================================
// WooCommerce API Service
// ============================================================================

import { db } from '@/db'
import { wooConnections, products, syncJobs, type WooConnection, type Product, type SyncJob } from '@/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'

// In-memory store for active sync jobs (for SSE updates)
const activeSyncJobs = new Map<number, { controller: ReadableStreamDefaultController | null }>()

export function getSyncJobStream(jobId: number): { controller: ReadableStreamDefaultController | null } | undefined {
  return activeSyncJobs.get(jobId)
}

export function setSyncJobStream(jobId: number, stream: { controller: ReadableStreamDefaultController | null }) {
  activeSyncJobs.set(jobId, stream)
}

export function deleteSyncJobStream(jobId: number) {
  activeSyncJobs.delete(jobId)
}

interface WooProduct {
  id: number
  name: string
  slug: string
  permalink: string
  type: 'simple' | 'variable' | 'variation' | 'grouped' | 'external'
  sku: string
  description: string
  short_description: string
  price: string
  regular_price: string
  sale_price: string
  stock_status: string
  stock_quantity: number | null
  categories: { id: number; name: string; slug: string }[]
  tags: { id: number; name: string; slug: string }[]
  images: { id: number; src: string; alt: string }[]
  attributes: { id: number; name: string; options: string[]; variation?: boolean }[]
  variations?: number[] // IDs of variations (for variable products)
}

interface WooVariation {
  id: number
  sku: string
  price: string
  regular_price: string
  sale_price: string
  stock_status: string
  stock_quantity: number | null
  image: { id: number; src: string; alt: string } | null
  attributes: { id: number; name: string; option: string }[]
}

interface WooApiResponse<T> {
  data: T
  headers: Headers
}

// Create WooCommerce API client
function createWooClient(connection: Pick<WooConnection, 'storeUrl' | 'consumerKey' | 'consumerSecret'>) {
  // Clean and validate the store URL
  let baseUrl = connection.storeUrl.trim().replace(/\/$/, '')
  
  // Ensure URL has protocol
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`
  }

  return {
    async get<T>(endpoint: string, params?: Record<string, string>): Promise<WooApiResponse<T>> {
      // Build URL with query parameters for authentication (more compatible with various server configs)
      const url = new URL(`${baseUrl}/wp-json/wc/v3${endpoint}`)
      
      // Use query string authentication (works better with many hosting setups)
      url.searchParams.set('consumer_key', connection.consumerKey)
      url.searchParams.set('consumer_secret', connection.consumerSecret)
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.set(key, value)
        })
      }

      let response: Response
      try {
        response = await fetch(url.toString(), {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Jastreb/1.0',
          },
        })
      } catch (fetchError: any) {
        if (fetchError.cause?.code === 'ENOTFOUND') {
          throw new Error(`Could not connect to store. Please check the URL: ${baseUrl}`)
        }
        if (fetchError.cause?.code === 'ECONNREFUSED') {
          throw new Error(`Connection refused. The store server may be down or blocking requests.`)
        }
        throw new Error(`Network error: ${fetchError.message}`)
      }

      const contentType = response.headers.get('content-type') || ''
      const responseText = await response.text()

      // Check if response is HTML (common error case)
      if (contentType.includes('text/html') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        if (response.status === 404) {
          throw new Error(`WooCommerce REST API not found. Make sure WooCommerce is installed and permalinks are set to something other than "Plain".`)
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed. Please check your Consumer Key and Consumer Secret.`)
        }
        throw new Error(`Received HTML instead of JSON. The WooCommerce REST API may not be accessible. Status: ${response.status}`)
      }

      // Try to parse JSON
      let data: T
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        throw new Error(`Invalid JSON response from WooCommerce API. Response: ${responseText.slice(0, 200)}`)
      }

      // Check for WooCommerce API errors in the response
      if (!response.ok) {
        const errorData = data as any
        if (errorData.code && errorData.message) {
          throw new Error(`WooCommerce API error: ${errorData.message} (${errorData.code})`)
        }
        throw new Error(`WooCommerce API error: ${response.status} - ${responseText.slice(0, 200)}`)
      }

      return {
        data,
        headers: response.headers,
      }
    },
  }
}

// Test WooCommerce connection
export async function testConnection(connection: Pick<WooConnection, 'storeUrl' | 'consumerKey' | 'consumerSecret'>) {
  try {
    // Validate inputs
    if (!connection.storeUrl) {
      return { success: false, error: 'Store URL is required' }
    }
    if (!connection.consumerKey) {
      return { success: false, error: 'Consumer Key is required' }
    }
    if (!connection.consumerSecret) {
      return { success: false, error: 'Consumer Secret is required' }
    }

    const client = createWooClient(connection)
    
    // Try to fetch one product to verify the connection works
    const { data } = await client.get<any[]>('/products', { per_page: '1' })
    
    // Verify we got an array back (valid WooCommerce response)
    if (!Array.isArray(data)) {
      return { success: false, error: 'Unexpected response format from WooCommerce API' }
    }
    
    return { success: true, productCount: data.length }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// Get total product count from WooCommerce
export async function getWooProductCount(connection: WooConnection, onlyInStock: boolean = false): Promise<number> {
  const client = createWooClient(connection)
  const params: Record<string, string> = {
    per_page: '1',
    page: '1',
    status: 'publish',
  }
  if (onlyInStock) {
    params.stock_status = 'instock'
  }
  const { headers } = await client.get<WooProduct[]>('/products', params)
  return parseInt(headers.get('x-wp-total') || '0', 10)
}

// Fetch products from WooCommerce page by page (for progress tracking)
export async function* fetchWooProductsWithProgress(
  connection: WooConnection,
  options: { onlyInStock?: boolean } = {}
): AsyncGenerator<{ products: WooProduct[]; page: number; totalPages: number; totalProducts: number }> {
  const client = createWooClient(connection)
  let page = 1
  const perPage = 100

  // Get first page to determine total
  const params: Record<string, string> = {
    per_page: perPage.toString(),
    page: page.toString(),
    status: 'publish',
  }
  if (options.onlyInStock) {
    params.stock_status = 'instock'
  }

  const { data: firstPageData, headers } = await client.get<WooProduct[]>('/products', params)
  const totalPages = parseInt(headers.get('x-wp-totalpages') || '1', 10)
  const totalProducts = parseInt(headers.get('x-wp-total') || '0', 10)

  yield { products: firstPageData, page: 1, totalPages, totalProducts }

  // Fetch remaining pages
  while (page < totalPages) {
    page++
    params.page = page.toString()
    const { data } = await client.get<WooProduct[]>('/products', params)
    yield { products: data, page, totalPages, totalProducts }
  }
}

// Fetch all products from WooCommerce (with pagination)
export async function fetchWooProducts(connection: WooConnection, onlyInStock: boolean = false): Promise<WooProduct[]> {
  const allProducts: WooProduct[] = []
  for await (const { products: pageProducts } of fetchWooProductsWithProgress(connection, { onlyInStock })) {
    allProducts.push(...pageProducts)
  }
  return allProducts
}

// Fetch variations for a variable product
export async function fetchProductVariations(
  connection: WooConnection,
  productId: number
): Promise<WooVariation[]> {
  const client = createWooClient(connection)
  const allVariations: WooVariation[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const { data, headers } = await client.get<WooVariation[]>(`/products/${productId}/variations`, {
      per_page: perPage.toString(),
      page: page.toString(),
    })

    allVariations.push(...data)

    const totalPages = parseInt(headers.get('x-wp-totalpages') || '1', 10)
    if (page >= totalPages) break
    page++
  }

  return allVariations
}

// Create a sync job
export async function createSyncJob(connectionId: number, userId: number, onlyInStock: boolean = false) {
  const [job] = await db
    .insert(syncJobs)
    .values({
      userId,
      connectionId,
      status: 'pending',
      onlyInStock,
      totalProducts: 0,
      processedProducts: 0,
      createdProducts: 0,
      updatedProducts: 0,
      skippedProducts: 0,
    })
    .returning()
  return job
}

// Get sync job by ID
export async function getSyncJob(jobId: number, userId: number) {
  return db
    .select()
    .from(syncJobs)
    .where(and(eq(syncJobs.id, jobId), eq(syncJobs.userId, userId)))
    .get()
}

// Get active sync job for a connection
export async function getActiveSyncJob(connectionId: number, userId: number) {
  return db
    .select()
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.connectionId, connectionId),
        eq(syncJobs.userId, userId),
        eq(syncJobs.status, 'processing')
      )
    )
    .get()
}

// Get recent sync jobs for a user
export async function getRecentSyncJobs(userId: number, limit: number = 10) {
  return db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, userId))
    .orderBy(desc(syncJobs.createdAt))
    .limit(limit)
    .all()
}

// Update sync job progress
export async function updateSyncJobProgress(
  jobId: number,
  updates: Partial<Pick<SyncJob, 'status' | 'totalProducts' | 'processedProducts' | 'createdProducts' | 'updatedProducts' | 'skippedProducts' | 'errorMessage' | 'startedAt' | 'completedAt'>>
) {
  const [job] = await db
    .update(syncJobs)
    .set(updates)
    .where(eq(syncJobs.id, jobId))
    .returning()
  
  // Send SSE update if there's an active stream
  const stream = getSyncJobStream(jobId)
  if (stream?.controller) {
    try {
      const data = JSON.stringify(job)
      stream.controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
    } catch (e) {
      // Stream might be closed
    }
  }
  
  return job
}

// Sync products from WooCommerce to local database (with progress tracking)
export async function syncProducts(connectionId: number, userId: number, options: { onlyInStock?: boolean; jobId?: number } = {}) {
  const connection = await db
    .select()
    .from(wooConnections)
    .where(and(eq(wooConnections.id, connectionId), eq(wooConnections.userId, userId)))
    .get()

  if (!connection) {
    throw new Error('Connection not found')
  }

  // Create or get sync job
  let jobId = options.jobId
  if (!jobId) {
    const job = await createSyncJob(connectionId, userId, options.onlyInStock || false)
    jobId = job.id
  }

  try {
    // Mark job as fetching
    await updateSyncJobProgress(jobId, {
      status: 'fetching',
      startedAt: new Date(),
    })

    const syncedAt = new Date()
    let totalProducts = 0
    let processedProducts = 0
    let createdProducts = 0
    let updatedProducts = 0
    let skippedProducts = 0

    // Process products page by page
    for await (const { products: pageProducts, page, totalPages, totalProducts: total } of fetchWooProductsWithProgress(connection, { onlyInStock: options.onlyInStock })) {
      // Update total on first page
      if (page === 1) {
        totalProducts = total
        await updateSyncJobProgress(jobId, {
          status: 'processing',
          totalProducts,
        })
      }

      // Process each product
      for (const wooProduct of pageProducts) {
        // Check if product already exists
        const existing = await db
          .select()
          .from(products)
          .where(and(eq(products.wooId, wooProduct.id), eq(products.connectionId, connectionId)))
          .get()

        const productData = {
          userId,
          wooId: wooProduct.id,
          connectionId,
          productType: wooProduct.type || 'simple',
          name: wooProduct.name,
          slug: wooProduct.slug,
          sku: wooProduct.sku || null,
          description: wooProduct.description,
          shortDescription: wooProduct.short_description,
          price: wooProduct.price,
          regularPrice: wooProduct.regular_price,
          salePrice: wooProduct.sale_price || null,
          stockStatus: wooProduct.stock_status,
          stockQuantity: wooProduct.stock_quantity,
          categories: wooProduct.categories.map((c) => c.name),
          tags: wooProduct.tags.map((t) => t.name),
          images: wooProduct.images.map((i) => ({ src: i.src, alt: i.alt })),
          attributes: wooProduct.attributes.map((attr) => ({
            name: attr.name,
            options: attr.options,
            variation: attr.variation,
          })),
          permalink: wooProduct.permalink,
          syncedAt,
        }

        let parentProductId: number

        if (existing) {
          await db.update(products).set(productData).where(eq(products.id, existing.id))
          parentProductId = existing.id
          updatedProducts++
        } else {
          const [newProduct] = await db.insert(products).values(productData).returning({ id: products.id })
          parentProductId = newProduct.id
          createdProducts++
        }

        // If this is a variable product, sync its variations
        if (wooProduct.type === 'variable') {
          try {
            const variations = await fetchProductVariations(connection, wooProduct.id)
            
            for (const variation of variations) {
              // Check if variation already exists
              const existingVariation = await db
                .select()
                .from(products)
                .where(and(eq(products.wooId, variation.id), eq(products.connectionId, connectionId)))
                .get()

              // Build variation name from attributes
              const variantName = variation.attributes.length > 0
                ? `${wooProduct.name} - ${variation.attributes.map(a => a.option).join(' / ')}`
                : `${wooProduct.name} - Variation ${variation.id}`

              const variationData = {
                userId,
                wooId: variation.id,
                connectionId,
                productType: 'variation' as const,
                parentId: parentProductId,
                wooParentId: wooProduct.id,
                name: variantName,
                sku: variation.sku || null,
                price: variation.price,
                regularPrice: variation.regular_price,
                salePrice: variation.sale_price || null,
                stockStatus: variation.stock_status,
                stockQuantity: variation.stock_quantity,
                images: variation.image ? [{ src: variation.image.src, alt: variation.image.alt }] : [],
                variantAttributes: variation.attributes.map((attr) => ({
                  name: attr.name,
                  option: attr.option,
                })),
                syncedAt,
              }

              if (existingVariation) {
                await db.update(products).set(variationData).where(eq(products.id, existingVariation.id))
                updatedProducts++
              } else {
                await db.insert(products).values(variationData)
                createdProducts++
              }
            }
          } catch (varError) {
            console.error(`Failed to sync variations for product ${wooProduct.id}:`, varError)
            // Continue with other products even if variations fail
          }
        }

        processedProducts++

        // Update progress every 5 products or at the end
        if (processedProducts % 5 === 0 || processedProducts === totalProducts) {
          await updateSyncJobProgress(jobId, {
            processedProducts,
            createdProducts,
            updatedProducts,
            skippedProducts,
          })
        }
      }
    }

    // Update last sync time on connection
    await db.update(wooConnections).set({ lastSyncAt: syncedAt }).where(eq(wooConnections.id, connectionId))

    // Mark job as completed
    await updateSyncJobProgress(jobId, {
      status: 'completed',
      processedProducts,
      createdProducts,
      updatedProducts,
      skippedProducts,
      completedAt: new Date(),
    })

    // Clean up stream
    deleteSyncJobStream(jobId)

    return { jobId, created: createdProducts, updated: updatedProducts, skipped: skippedProducts, total: totalProducts }
  } catch (error: any) {
    // Mark job as failed
    await updateSyncJobProgress(jobId, {
      status: 'failed',
      errorMessage: error.message,
      completedAt: new Date(),
    })

    // Clean up stream
    deleteSyncJobStream(jobId)

    throw error
  }
}

// Start background sync (doesn't await completion)
export function startBackgroundSync(connectionId: number, userId: number, options: { onlyInStock?: boolean } = {}) {
  // Run sync in background
  syncProducts(connectionId, userId, options).catch((error) => {
    console.error('Background sync error:', error)
  })
}

// Get all connections for a user
export async function getConnections(userId: number) {
  return db.select().from(wooConnections).where(eq(wooConnections.userId, userId)).all()
}

// Get a single connection
export async function getConnection(connectionId: number, userId: number) {
  return db
    .select()
    .from(wooConnections)
    .where(and(eq(wooConnections.id, connectionId), eq(wooConnections.userId, userId)))
    .get()
}

// Create a new connection
export async function createConnection(
  userId: number,
  data: Pick<WooConnection, 'name' | 'storeUrl' | 'consumerKey' | 'consumerSecret'>
) {
  const [connection] = await db
    .insert(wooConnections)
    .values({
      userId,
      name: data.name,
      storeUrl: data.storeUrl,
      consumerKey: data.consumerKey,
      consumerSecret: data.consumerSecret,
    })
    .returning()
  return connection
}

// Update a connection
export async function updateConnection(
  connectionId: number,
  userId: number,
  data: Partial<Pick<WooConnection, 'name' | 'storeUrl' | 'consumerKey' | 'consumerSecret' | 'isActive'>>
) {
  const [connection] = await db
    .update(wooConnections)
    .set(data)
    .where(and(eq(wooConnections.id, connectionId), eq(wooConnections.userId, userId)))
    .returning()
  return connection
}

// Delete a connection
export async function deleteConnection(connectionId: number, userId: number) {
  await db.delete(wooConnections).where(and(eq(wooConnections.id, connectionId), eq(wooConnections.userId, userId)))
}

// Get all products for a user
export async function getProducts(
  userId: number, 
  options?: { 
    connectionId?: number
    search?: string
    productType?: 'simple' | 'variable' | 'variation' | 'grouped' | 'external'
    excludeVariations?: boolean
    parentId?: number
    page?: number
    limit?: number
  }
) {
  const conditions = [eq(products.userId, userId)]

  if (options?.connectionId) {
    conditions.push(eq(products.connectionId, options.connectionId))
  }

  if (options?.productType) {
    conditions.push(eq(products.productType, options.productType))
  }

  // By default, exclude variations from main list unless specifically requested
  if (options?.excludeVariations !== false && !options?.parentId && !options?.productType) {
    conditions.push(
      sql`(${products.productType} IS NULL OR ${products.productType} != 'variation')`
    )
  }

  if (options?.parentId) {
    conditions.push(eq(products.parentId, options.parentId))
  }

  let allProducts = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.syncedAt))
    .all()

  // Filter by search if provided
  if (options?.search) {
    const searchLower = options.search.toLowerCase()
    allProducts = allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.sku?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
    )
  }

  // Pagination
  const total = allProducts.length
  const page = options?.page || 1
  const limit = options?.limit || 50
  const offset = (page - 1) * limit
  const paginatedProducts = allProducts.slice(offset, offset + limit)

  return {
    products: paginatedProducts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// Get variants for a product
export async function getProductVariants(productId: number, userId: number) {
  return db
    .select()
    .from(products)
    .where(and(eq(products.parentId, productId), eq(products.userId, userId)))
    .all()
}

// Get a single product
export async function getProduct(productId: number, userId: number) {
  return db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .get()
}

// Get product with variants
export async function getProductWithVariants(productId: number, userId: number) {
  const product = await getProduct(productId, userId)
  if (!product) return null
  
  const variants = await getProductVariants(productId, userId)
  return { ...product, variants }
}

// Update a product (local edits)
export async function updateProduct(productId: number, userId: number, data: Partial<Omit<Product, 'id' | 'userId' | 'wooId' | 'connectionId' | 'createdAt'>>) {
  const [product] = await db
    .update(products)
    .set(data)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .returning()
  return product
}

// Delete a product
export async function deleteProduct(productId: number, userId: number) {
  await db.delete(products).where(and(eq(products.id, productId), eq(products.userId, userId)))
}

