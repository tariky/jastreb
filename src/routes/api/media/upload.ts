import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions, productMedia, products } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { smartUploadBase64Image, smartDeleteFile, isS3Configured, generateMediaKey, getPresignedUploadUrl, getPublicUrl } from '@/lib/storage'

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

export const Route = createFileRoute('/api/media/upload')({
  server: {
    handlers: {
      // GET - Get presigned upload URL
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!isS3Configured()) {
          return json({ error: 'S3 storage not configured' }, { status: 500 })
        }

        const url = new URL(request.url)
        const productId = url.searchParams.get('productId')
        const filename = url.searchParams.get('filename')
        const contentType = url.searchParams.get('contentType') || 'image/png'
        const type = url.searchParams.get('type') as 'image' | 'video' || 'image'

        if (!productId || !filename) {
          return json({ error: 'productId and filename required' }, { status: 400 })
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

        try {
          const key = generateMediaKey(user.id, parseInt(productId), type, filename)
          const presignedUrl = await getPresignedUploadUrl(key, contentType)
          const publicUrl = getPublicUrl(key)

          return json({ presignedUrl, key, publicUrl })
        } catch (error: any) {
          console.error('Presigned URL error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // POST - Upload media (base64 or save after presigned upload)
      POST: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { productId, type, source, base64Data, url, key, filename, mimeType, width, height, prompt, setAsPrimary } = body

          if (!productId || !type) {
            return json({ error: 'productId and type required' }, { status: 400 })
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

          let mediaUrl = url
          let mediaKey = key

          // If base64 data provided, upload to storage (S3 or local)
          if (base64Data) {
            const result = await smartUploadBase64Image(
              base64Data,
              user.id,
              parseInt(productId),
              filename || `generated-${Date.now()}.png`
            )
            mediaUrl = result.url
            mediaKey = result.key
          }

          if (!mediaUrl) {
            return json({ error: 'No media URL or base64 data provided' }, { status: 400 })
          }

          // If setting as primary, unset other primaries of same type
          if (setAsPrimary) {
            await db
              .update(productMedia)
              .set({ isPrimary: false })
              .where(and(eq(productMedia.productId, parseInt(productId)), eq(productMedia.type, type)))
          }

          // Save media record
          const [media] = await db
            .insert(productMedia)
            .values({
              productId: parseInt(productId),
              type,
              source: source || 'gemini',
              url: mediaUrl,
              localPath: mediaKey || null,
              mimeType: mimeType || (type === 'video' ? 'video/mp4' : 'image/png'),
              width: width || null,
              height: height || null,
              prompt: prompt || null,
              isPrimary: setAsPrimary || false,
            })
            .returning()

          return json({ media }, { status: 201 })
        } catch (error: any) {
          console.error('Upload error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // DELETE - Delete media
      DELETE: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const mediaId = url.searchParams.get('id')

        if (!mediaId) {
          return json({ error: 'Media ID required' }, { status: 400 })
        }

        try {
          // Get media and verify ownership through product
          const media = await db.select().from(productMedia).where(eq(productMedia.id, parseInt(mediaId))).get()
          
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

          // Delete from storage if we have a key
          if (media.localPath) {
            try {
              await smartDeleteFile(media.localPath)
            } catch (e) {
              console.error('Failed to delete file:', e)
            }
          }

          // Delete from database
          await db.delete(productMedia).where(eq(productMedia.id, parseInt(mediaId)))

          return json({ success: true })
        } catch (error: any) {
          console.error('Delete media error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
