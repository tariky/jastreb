import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  getConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
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

export const Route = createFileRoute('/api/woo/connections')({
  server: {
    handlers: {
      // GET - List all connections or get single connection
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const connectionId = url.searchParams.get('id')

        try {
          if (connectionId) {
            const connection = await getConnection(parseInt(connectionId), user.id)
            if (!connection) {
              return json({ error: 'Connection not found' }, { status: 404 })
            }
            // Don't send secrets in response
            return json({
              connection: {
                ...connection,
                consumerKey: '***hidden***',
                consumerSecret: '***hidden***',
              },
            })
          }

          const connections = await getConnections(user.id)
          return json({
            connections: connections.map((c) => ({
              ...c,
              consumerKey: '***hidden***',
              consumerSecret: '***hidden***',
            })),
          })
        } catch (error: any) {
          console.error('Get connections error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // POST - Create new connection or test connection
      POST: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { action, name, storeUrl, consumerKey, consumerSecret } = body

          // Test connection before saving
          if (action === 'test') {
            const result = await testConnection({ storeUrl, consumerKey, consumerSecret })
            return json(result)
          }

          // Create new connection
          if (!name || !storeUrl || !consumerKey || !consumerSecret) {
            return json({ error: 'Missing required fields' }, { status: 400 })
          }

          // Test connection first
          const testResult = await testConnection({ storeUrl, consumerKey, consumerSecret })
          if (!testResult.success) {
            return json({ error: `Connection failed: ${testResult.error}` }, { status: 400 })
          }

          const connection = await createConnection(user.id, {
            name,
            storeUrl,
            consumerKey,
            consumerSecret,
          })

          return json(
            {
              connection: {
                ...connection,
                consumerKey: '***hidden***',
                consumerSecret: '***hidden***',
              },
            },
            { status: 201 }
          )
        } catch (error: any) {
          console.error('Create connection error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // PUT - Update connection
      PUT: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { id, name, storeUrl, consumerKey, consumerSecret, isActive } = body

          if (!id) {
            return json({ error: 'Connection ID required' }, { status: 400 })
          }

          // If updating credentials, test them first
          if (storeUrl && consumerKey && consumerSecret) {
            const testResult = await testConnection({ storeUrl, consumerKey, consumerSecret })
            if (!testResult.success) {
              return json({ error: `Connection failed: ${testResult.error}` }, { status: 400 })
            }
          }

          const connection = await updateConnection(parseInt(id), user.id, {
            name,
            storeUrl,
            consumerKey,
            consumerSecret,
            isActive,
          })

          if (!connection) {
            return json({ error: 'Connection not found' }, { status: 404 })
          }

          return json({
            connection: {
              ...connection,
              consumerKey: '***hidden***',
              consumerSecret: '***hidden***',
            },
          })
        } catch (error: any) {
          console.error('Update connection error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // DELETE - Delete connection
      DELETE: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const connectionId = url.searchParams.get('id')

          if (!connectionId) {
            return json({ error: 'Connection ID required' }, { status: 400 })
          }

          await deleteConnection(parseInt(connectionId), user.id)
          return json({ success: true })
        } catch (error: any) {
          console.error('Delete connection error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
