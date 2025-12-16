import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { clearUserAIClient } from '@/lib/gemini'
import { z } from 'zod'

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

const updateSettingsSchema = z.object({
  googleAiApiKey: z.string().optional().nullable(),
})

export const Route = createFileRoute('/api/user/settings')({
  server: {
    handlers: {
      // GET - Get user settings
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const userData = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              googleAiApiKey: users.googleAiApiKey,
            })
            .from(users)
            .where(eq(users.id, user.id))
            .get()

          if (!userData) {
            return json({ error: 'User not found' }, { status: 404 })
          }

          // Don't return the actual API key, just indicate if it's set
          return json({
            id: userData.id,
            email: userData.email,
            name: userData.name,
            hasGoogleAiApiKey: !!userData.googleAiApiKey,
          })
        } catch (error: any) {
          console.error('Get settings error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // PUT - Update user settings
      PUT: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const parsed = updateSettingsSchema.safeParse(body)

          if (!parsed.success) {
            return json(
              { error: 'Invalid input', details: parsed.error.flatten() },
              { status: 400 }
            )
          }

          // Update user settings
          const updateData: { googleAiApiKey?: string | null; updatedAt: Date } = {
            updatedAt: new Date(),
          }

          if (parsed.data.googleAiApiKey !== undefined) {
            // Allow setting to null/empty string to clear the key
            updateData.googleAiApiKey = parsed.data.googleAiApiKey || null
          }

          await db.update(users).set(updateData).where(eq(users.id, user.id))

          // Clear cached AI client for this user if API key changed
          if (parsed.data.googleAiApiKey !== undefined) {
            clearUserAIClient(user.id)
          }

          return json({ success: true, message: 'Settings updated' })
        } catch (error: any) {
          console.error('Update settings error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
