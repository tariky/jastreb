import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  syncProducts,
  getConnection,
  createSyncJob,
  getSyncJob,
  getActiveSyncJob,
  getRecentSyncJobs,
  setSyncJobStream,
  getSyncJobStream,
  deleteSyncJobStream,
} from '@/lib/woocommerce'

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

export const Route = createFileRoute('/api/woo/sync')({
  server: {
    handlers: {
      // GET - Get sync job status or stream progress
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const jobId = url.searchParams.get('jobId')
        const stream = url.searchParams.get('stream') === 'true'
        const connectionId = url.searchParams.get('connectionId')

        try {
          // Get active job for connection
          if (connectionId && !jobId) {
            const activeJob = await getActiveSyncJob(parseInt(connectionId), user.id)
            if (activeJob) {
              return json({ job: activeJob })
            }
            return json({ job: null })
          }

          // Get specific job status
          if (jobId && !stream) {
            const job = await getSyncJob(parseInt(jobId), user.id)
            if (!job) {
              return json({ error: 'Job not found' }, { status: 404 })
            }
            return json({ job })
          }

          // SSE stream for job progress
          if (jobId && stream) {
            const job = await getSyncJob(parseInt(jobId), user.id)
            if (!job) {
              return json({ error: 'Job not found' }, { status: 404 })
            }

            // If job is already completed or failed, return current status
            if (job.status === 'completed' || job.status === 'failed') {
              return json({ job })
            }

            // Create SSE stream
            const responseStream = new ReadableStream({
              start(controller) {
                // Store controller for updates
                setSyncJobStream(parseInt(jobId!), { controller })

                // Send initial state
                const data = JSON.stringify(job)
                controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
              },
              cancel() {
                deleteSyncJobStream(parseInt(jobId!))
              },
            })

            return new Response(responseStream, {
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
              },
            })
          }

          // Get recent sync jobs
          const jobs = await getRecentSyncJobs(user.id)
          return json({ jobs })
        } catch (error: any) {
          console.error('Get sync status error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // POST - Start sync
      POST: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { connectionId, onlyInStock = false } = body

          if (!connectionId) {
            return json({ error: 'Connection ID required' }, { status: 400 })
          }

          // Verify connection exists and belongs to user
          const connection = await getConnection(parseInt(connectionId), user.id)
          if (!connection) {
            return json({ error: 'Connection not found' }, { status: 404 })
          }

          if (!connection.isActive) {
            return json({ error: 'Connection is not active' }, { status: 400 })
          }

          // Check if there's already an active sync for this connection
          const activeJob = await getActiveSyncJob(parseInt(connectionId), user.id)
          if (activeJob) {
            return json({ error: 'Sync already in progress', job: activeJob }, { status: 409 })
          }

          // Create sync job
          const job = await createSyncJob(parseInt(connectionId), user.id, onlyInStock)

          // Start background sync
          syncProducts(parseInt(connectionId), user.id, { onlyInStock, jobId: job.id }).catch((error) => {
            console.error('Background sync error:', error)
          })

          return json({
            success: true,
            job,
            message: 'Sync started',
          })
        } catch (error: any) {
          console.error('Sync error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
