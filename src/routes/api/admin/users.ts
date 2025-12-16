import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { createUser, getUserByEmail, validateSession, SESSION_COOKIE_NAME } from '@/lib/auth'
import { z } from 'zod'

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=')
      return [key, val.join('=')]
    })
  )
}

async function requireAdmin(request: Request) {
  const cookies = parseCookies(request.headers.get('cookie') || '')
  const sessionId = cookies[SESSION_COOKIE_NAME]

  if (!sessionId) {
    return null
  }

  const user = await validateSession(sessionId)
  if (!user || !user.isAdmin) {
    return null
  }
  return user
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
  isAdmin: z.boolean().optional().default(false),
})

export const Route = createFileRoute('/api/admin/users')({
  server: {
    handlers: {
      // GET - List all users (admin only)
      GET: async ({ request }) => {
        const admin = await requireAdmin(request)
        if (!admin) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const allUsers = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              isAdmin: users.isAdmin,
              createdAt: users.createdAt,
            })
            .from(users)
            .orderBy(users.createdAt)

          return json({ users: allUsers })
        } catch (error: any) {
          console.error('Get users error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // POST - Create new user (admin only)
      POST: async ({ request }) => {
        const admin = await requireAdmin(request)
        if (!admin) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const parsed = createUserSchema.safeParse(body)

          if (!parsed.success) {
            return json(
              { error: 'Invalid input', details: parsed.error.flatten() },
              { status: 400 }
            )
          }

          // Check if user already exists
          const existing = await getUserByEmail(parsed.data.email)
          if (existing) {
            return json({ error: 'Email already registered' }, { status: 400 })
          }

          // Validate password length
          if (parsed.data.password.length < 8) {
            return json({ error: 'Password must be at least 8 characters' }, { status: 400 })
          }

          // Create user (admin can set isAdmin flag)
          const newUser = await createUser(
            parsed.data.email,
            parsed.data.password,
            parsed.data.name,
            parsed.data.isAdmin || false
          )

          return json({
            user: {
              id: newUser.id,
              email: newUser.email,
              name: newUser.name,
              isAdmin: newUser.isAdmin,
            },
          }, { status: 201 })
        } catch (error: any) {
          console.error('Create user error:', error)
          return json({ error: error.message || 'Failed to create user' }, { status: 500 })
        }
      },

      // DELETE - Delete user (admin only, cannot delete self)
      DELETE: async ({ request }) => {
        const admin = await requireAdmin(request)
        if (!admin) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const userId = url.searchParams.get('id')

        if (!userId) {
          return json({ error: 'User ID required' }, { status: 400 })
        }

        const userIdNum = parseInt(userId)

        // Prevent self-deletion
        if (userIdNum === admin.id) {
          return json({ error: 'Cannot delete your own account' }, { status: 400 })
        }

        try {
          // Check if user exists
          const userToDelete = await db
            .select()
            .from(users)
            .where(eq(users.id, userIdNum))
            .get()

          if (!userToDelete) {
            return json({ error: 'User not found' }, { status: 404 })
          }

          // Delete user (cascade will handle sessions)
          await db.delete(users).where(eq(users.id, userIdNum))

          return json({ success: true })
        } catch (error: any) {
          console.error('Delete user error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
