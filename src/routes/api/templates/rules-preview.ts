import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions, products } from '@/db/schema'
import { eq, and, like, or, gte, lte, inArray } from 'drizzle-orm'

async function getUserFromRequest(request: Request) {
  const cookies = request.headers.get('cookie') || ''
  const sessionId = cookies
    .split(';')
    .find((c) => c.trim().startsWith('jastreb_session='))
    ?.split('=')[1]

  if (!sessionId) return null

  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
  if (!session || session.expiresAt < new Date()) return null

  return { id: session.userId }
}

interface RuleConditions {
  categories?: string[]
  tags?: string[]
  priceMin?: number
  priceMax?: number
  stockStatus?: string[]
  productType?: string[]
  skuPattern?: string
  namePattern?: string
}

// Check if a product matches rule conditions
function productMatchesConditions(
  product: typeof products.$inferSelect,
  conditions: RuleConditions
): boolean {
  // Categories check
  if (conditions.categories?.length) {
    const productCategories = product.categories || []
    const hasMatchingCategory = conditions.categories.some((cat) =>
      productCategories.some((pc) => pc.toLowerCase().includes(cat.toLowerCase()))
    )
    if (!hasMatchingCategory) return false
  }

  // Tags check
  if (conditions.tags?.length) {
    const productTags = product.tags || []
    const hasMatchingTag = conditions.tags.some((tag) =>
      productTags.some((pt) => pt.toLowerCase().includes(tag.toLowerCase()))
    )
    if (!hasMatchingTag) return false
  }

  // Price range check
  const price = parseFloat(product.price || '0')
  if (conditions.priceMin !== undefined && price < conditions.priceMin) return false
  if (conditions.priceMax !== undefined && price > conditions.priceMax) return false

  // Stock status check
  if (conditions.stockStatus?.length) {
    if (!product.stockStatus || !conditions.stockStatus.includes(product.stockStatus)) {
      return false
    }
  }

  // Product type check
  if (conditions.productType?.length) {
    if (!product.productType || !conditions.productType.includes(product.productType)) {
      return false
    }
  }

  // SKU pattern check
  if (conditions.skuPattern) {
    try {
      const regex = new RegExp(conditions.skuPattern, 'i')
      if (!product.sku || !regex.test(product.sku)) return false
    } catch {
      // Invalid regex, skip this check
    }
  }

  // Name pattern check
  if (conditions.namePattern) {
    try {
      const regex = new RegExp(conditions.namePattern, 'i')
      if (!regex.test(product.name)) return false
    } catch {
      // Invalid regex, skip this check
    }
  }

  return true
}

export const Route = createFileRoute('/api/templates/rules-preview')({
  server: {
    handlers: {
      // POST - Preview products matching rule conditions
      POST: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { conditions, limit = 10 } = body as { conditions: RuleConditions; limit?: number }

          if (!conditions) {
            return json({ error: 'Conditions required' }, { status: 400 })
          }

          // Fetch user's products (exclude variations for cleaner results)
          const allProducts = await db
            .select()
            .from(products)
            .where(
              and(
                eq(products.userId, user.id),
                or(
                  eq(products.productType, 'simple'),
                  eq(products.productType, 'variable')
                )
              )
            )
            .all()

          // Filter products by conditions
          const matchingProducts = allProducts.filter((product) =>
            productMatchesConditions(product, conditions)
          )

          // Return limited results with summary
          const limitedProducts = matchingProducts.slice(0, limit).map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: p.price,
            stockStatus: p.stockStatus,
            productType: p.productType,
            categories: p.categories,
            tags: p.tags,
            image: p.images?.[0]?.src || null,
          }))

          return json({
            total: matchingProducts.length,
            totalProducts: allProducts.length,
            products: limitedProducts,
          })
        } catch (error: any) {
          console.error('Rules preview error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
