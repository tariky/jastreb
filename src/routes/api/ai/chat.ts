import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  createChatSession,
  sendChatMessage,
  getChatSession,
  getChatMessages,
  archiveChatSession,
  deleteChatSession,
  updateChatSessionTitle,
  createGenerationJob,
  getGenerationJob,
  getGenerationJobsBySession,
  getUserGenerationJobs,
  type ImageGenerationConfig,
} from '@/lib/gemini'
import { validateSession, SESSION_COOKIE_NAME } from '@/lib/auth'
import { db } from '@/db'
import { aiChatSessions } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=')
      return [key, val.join('=')]
    })
  )
}

async function requireAuth(request: Request) {
  const cookies = parseCookies(request.headers.get('cookie') || '')
  const sessionId = cookies[SESSION_COOKIE_NAME]

  if (!sessionId) {
    return null
  }

  return validateSession(sessionId)
}

const createSessionSchema = z.object({
  productId: z.number().optional(),
  title: z.string().optional(),
})

const sendMessageSchema = z.object({
  sessionId: z.number(),
  message: z.string().min(1),
  aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).optional(),
  imageSize: z.enum(['1K', '2K', '4K']).optional(),
  useGoogleSearch: z.boolean().optional(),
  referenceImages: z.array(z.string()).optional(),
})

const updateSessionSchema = z.object({
  sessionId: z.number(),
  title: z.string().min(1).max(200),
})

export const Route = createFileRoute('/api/ai/chat')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireAuth(request)
          if (!user) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const url = new URL(request.url)
          const sessionId = url.searchParams.get('sessionId')
          const jobId = url.searchParams.get('jobId')
          const jobs = url.searchParams.get('jobs') === 'true'

          if (jobId) {
            // Get specific job
            const job = await getGenerationJob(Number(jobId))
            if (!job || job.userId !== user.id) {
              return json({ error: 'Job not found' }, { status: 404 })
            }
            return json({ job })
          }

          if (jobs) {
            // Get all user jobs
            const status = url.searchParams.get('status') as 'pending' | 'processing' | 'completed' | 'failed' | undefined
            const allJobs = await getUserGenerationJobs(user.id, status)
            return json({ jobs: allJobs })
          }

          if (sessionId) {
            const session = await getChatSession(Number(sessionId))

            if (!session || session.userId !== user.id) {
              return json({ error: 'Session not found' }, { status: 404 })
            }

            const messages = await getChatMessages(session.id)
            const sessionJobs = await getGenerationJobsBySession(Number(sessionId))

            return json({ session, messages, jobs: sessionJobs })
          }

          const sessions = await db
            .select()
            .from(aiChatSessions)
            .where(eq(aiChatSessions.userId, user.id))
            .orderBy(desc(aiChatSessions.updatedAt))

          return json({ sessions })
        } catch (error) {
          console.error('Chat GET error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireAuth(request)
          if (!user) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const body = await request.json()
          const url = new URL(request.url)
          const action = url.searchParams.get('action')

          if (action === 'create') {
            const parsed = createSessionSchema.safeParse(body)

            if (!parsed.success) {
              return json(
                { error: 'Invalid input', details: parsed.error.flatten() },
                { status: 400 }
              )
            }

            const sessionId = await createChatSession(
              user.id,
              parsed.data.productId,
              parsed.data.title
            )

            const session = await getChatSession(sessionId)

            return json({ session }, { status: 201 })
          }

          const parsed = sendMessageSchema.safeParse(body)

          if (!parsed.success) {
            return json(
              { error: 'Invalid input', details: parsed.error.flatten() },
              { status: 400 }
            )
          }

          const session = await getChatSession(parsed.data.sessionId)

          if (!session || session.userId !== user.id) {
            return json({ error: 'Session not found' }, { status: 404 })
          }

          const config: ImageGenerationConfig = {
            aspectRatio: parsed.data.aspectRatio,
            imageSize: parsed.data.imageSize,
            useGoogleSearch: parsed.data.useGoogleSearch,
          }

          // Create generation job (async processing)
          const jobId = await createGenerationJob(
            user.id,
            parsed.data.sessionId,
            parsed.data.message,
            config,
            parsed.data.referenceImages
          )

          // Return job info immediately
          return json({
            jobId,
            status: 'pending',
            message: 'Generation job created and queued',
          })
        } catch (error) {
          console.error('Chat POST error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },

      PUT: async ({ request }) => {
        try {
          const user = await requireAuth(request)
          if (!user) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const body = await request.json()
          const parsed = updateSessionSchema.safeParse(body)

          if (!parsed.success) {
            return json(
              { error: 'Invalid input', details: parsed.error.flatten() },
              { status: 400 }
            )
          }

          const session = await getChatSession(parsed.data.sessionId)

          if (!session || session.userId !== user.id) {
            return json({ error: 'Session not found' }, { status: 404 })
          }

          await updateChatSessionTitle(parsed.data.sessionId, parsed.data.title)

          const updatedSession = await getChatSession(parsed.data.sessionId)

          return json({ session: updatedSession })
        } catch (error) {
          console.error('Chat PUT error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },

      DELETE: async ({ request }) => {
        try {
          const user = await requireAuth(request)
          if (!user) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const url = new URL(request.url)
          const sessionId = url.searchParams.get('sessionId')

          if (!sessionId) {
            return json({ error: 'Session ID required' }, { status: 400 })
          }

          const session = await getChatSession(Number(sessionId))

          if (!session || session.userId !== user.id) {
            return json({ error: 'Session not found' }, { status: 404 })
          }

          await deleteChatSession(session.id)

          return json({ success: true })
        } catch (error) {
          console.error('Chat DELETE error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
