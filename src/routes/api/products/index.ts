import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getProducts, getProduct, getProductWithVariants, getProductVariants, updateProduct, deleteProduct } from '@/lib/woocommerce'

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

export const Route = createFileRoute('/api/products/')({
  server: {
    handlers: {
      // GET - List all products or get single product
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const productId = url.searchParams.get('id')
        const connectionId = url.searchParams.get('connectionId')
        const search = url.searchParams.get('search')
        const page = url.searchParams.get('page')
        const limit = url.searchParams.get('limit')
        const productType = url.searchParams.get('productType') as 'simple' | 'variable' | 'variation' | 'grouped' | 'external' | null
        const excludeVariations = url.searchParams.get('excludeVariations') !== 'false'
        const parentId = url.searchParams.get('parentId')
        const includeVariants = url.searchParams.get('includeVariants') === 'true'

        try {
          if (productId) {
            // Get single product, optionally with variants
            if (includeVariants) {
              const productWithVariants = await getProductWithVariants(parseInt(productId), user.id)
              if (!productWithVariants) {
                return json({ error: 'Product not found' }, { status: 404 })
              }
              return json({ product: productWithVariants })
            }
            
            const product = await getProduct(parseInt(productId), user.id)
            if (!product) {
              return json({ error: 'Product not found' }, { status: 404 })
            }
            return json({ product })
          }

          // Get variants for a specific product
          if (parentId) {
            const variants = await getProductVariants(parseInt(parentId), user.id)
            return json({ variants })
          }

          const result = await getProducts(user.id, {
            connectionId: connectionId ? parseInt(connectionId) : undefined,
            search: search || undefined,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 50,
            productType: productType || undefined,
            excludeVariations,
          })

          return json(result)
        } catch (error: any) {
          console.error('Get products error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // PUT - Update product
      PUT: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { id, ...updateData } = body

          if (!id) {
            return json({ error: 'Product ID required' }, { status: 400 })
          }

          // Only allow updating certain fields
          const allowedFields = [
            'name',
            'description',
            'shortDescription',
            'price',
            'regularPrice',
            'salePrice',
            'stockStatus',
            'categories',
            'tags',
            'sku',
          ]

          const filteredData: Record<string, any> = {}
          for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
              filteredData[field] = updateData[field]
            }
          }

          const product = await updateProduct(parseInt(id), user.id, filteredData)

          if (!product) {
            return json({ error: 'Product not found' }, { status: 404 })
          }

          return json({ product })
        } catch (error: any) {
          console.error('Update product error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // DELETE - Delete product
      DELETE: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const productId = url.searchParams.get('id')

          if (!productId) {
            return json({ error: 'Product ID required' }, { status: 400 })
          }

          await deleteProduct(parseInt(productId), user.id)
          return json({ success: true })
        } catch (error: any) {
          console.error('Delete product error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
