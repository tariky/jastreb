import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { eq } from 'drizzle-orm'

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

export const Route = createFileRoute('/api/media/proxy')({
  server: {
    handlers: {
      // GET - Fetch external image and return as base64
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const imageUrl = url.searchParams.get('url')

        if (!imageUrl) {
          return json({ error: 'URL parameter required' }, { status: 400 })
        }

        try {
          // Fetch the image from the external URL
          const response = await fetch(imageUrl, {
            headers: {
              'User-Agent': 'Jastreb/1.0',
              'Accept': 'image/*',
            },
          })

          if (!response.ok) {
            return json({ error: `Failed to fetch image: ${response.status}` }, { status: 400 })
          }

          const contentType = response.headers.get('content-type') || 'image/jpeg'
          
          // Check if it's actually an image
          if (!contentType.startsWith('image/')) {
            return json({ error: 'URL does not point to an image' }, { status: 400 })
          }

          // Convert to base64
          const arrayBuffer = await response.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const base64 = buffer.toString('base64')

          return json({ 
            base64,
            mimeType: contentType,
            size: buffer.length,
          })
        } catch (error: any) {
          console.error('Image proxy error:', error)
          return json({ error: error.message || 'Failed to fetch image' }, { status: 500 })
        }
      },
    },
  },
})
