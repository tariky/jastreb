import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions, productMedia, products } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

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

export const Route = createFileRoute('/api/media/')({
  server: {
    handlers: {
      // GET - Get media for a product
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const productId = url.searchParams.get('productId')

        if (!productId) {
          return json({ error: 'productId required' }, { status: 400 })
        }

        // Verify product belongs to user
        const product = await db
          .select()
          .from(products)
          .where(and(eq(products.id, parseInt(productId)), eq(products.userId, user.id)))
          .get()

        if (!product) {
          return json({ error: 'Product not found' }, { status: 404 })
        }

        const media = await db
          .select()
          .from(productMedia)
          .where(eq(productMedia.productId, parseInt(productId)))
          .all()

        return json({ media })
      },

      // PUT - Update media (set as primary)
      PUT: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { id, isPrimary } = body

          if (!id) {
            return json({ error: 'Media ID required' }, { status: 400 })
          }

          // Get media and verify ownership through product
          const media = await db.select().from(productMedia).where(eq(productMedia.id, parseInt(id))).get()
          
          if (!media) {
            return json({ error: 'Media not found' }, { status: 404 })
          }

          const product = await db
            .select()
            .from(products)
            .where(and(eq(products.id, media.productId), eq(products.userId, user.id)))
            .get()

          if (!product) {
            return json({ error: 'Unauthorized' }, { status: 403 })
          }

          // If setting as primary, unset other primaries of same type
          if (isPrimary) {
            await db
              .update(productMedia)
              .set({ isPrimary: false })
              .where(and(eq(productMedia.productId, media.productId), eq(productMedia.type, media.type)))
          }

          // Update media
          const [updatedMedia] = await db
            .update(productMedia)
            .set({ isPrimary })
            .where(eq(productMedia.id, parseInt(id)))
            .returning()

          return json({ media: updatedMedia })
        } catch (error: any) {
          console.error('Update media error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
