import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { generateImage, type ImageGenerationConfig } from '@/lib/gemini'
import { validateSession, SESSION_COOKIE_NAME } from '@/lib/auth'
import { z } from 'zod'

const generateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).optional(),
  imageSize: z.enum(['1K', '2K', '4K']).optional(),
  useGoogleSearch: z.boolean().optional(),
  referenceImages: z.array(z.string()).optional(),
})

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=')
      return [key, val.join('=')]
    })
  )
}

export const Route = createFileRoute('/api/ai/generate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const cookies = parseCookies(request.headers.get('cookie') || '')
          const sessionId = cookies[SESSION_COOKIE_NAME]

          if (!sessionId) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const user = await validateSession(sessionId)
          if (!user) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const body = await request.json()
          const parsed = generateSchema.safeParse(body)

          if (!parsed.success) {
            return json(
              { error: 'Invalid input', details: parsed.error.flatten() },
              { status: 400 }
            )
          }

          const config: ImageGenerationConfig = {
            aspectRatio: parsed.data.aspectRatio,
            imageSize: parsed.data.imageSize,
            useGoogleSearch: parsed.data.useGoogleSearch,
          }

          const result = await generateImage(
            parsed.data.prompt,
            config,
            parsed.data.referenceImages,
            user.id // Pass user ID for user-specific API key
          )

          if (result.error) {
            return json({ error: result.error }, { status: 500 })
          }

          return json(result)
        } catch (error) {
          console.error('AI generate error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
