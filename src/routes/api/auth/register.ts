import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { register, SESSION_COOKIE_NAME, getSessionCookieOptions, hasAnyUsers } from '@/lib/auth'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
})

export const Route = createFileRoute('/api/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Check if registration is allowed (only if no users exist)
          const usersExist = await hasAnyUsers()
          if (usersExist) {
            return json(
              { error: 'Registration is disabled. Please contact an administrator to create an account.' },
              { status: 403 }
            )
          }

          const body = await request.json()
          const parsed = registerSchema.safeParse(body)

          if (!parsed.success) {
            return json(
              { error: 'Invalid input', details: parsed.error.flatten() },
              { status: 400 }
            )
          }

          const result = await register(
            parsed.data.email,
            parsed.data.password,
            parsed.data.name
          )

          if ('error' in result) {
            return json({ error: result.error }, { status: 400 })
          }

          const { user, sessionId } = result
          const cookieOptions = getSessionCookieOptions()

          return new Response(
            JSON.stringify({
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.isAdmin || false,
              },
            }),
            {
              status: 201,
              headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': `${SESSION_COOKIE_NAME}=${sessionId}; Path=${cookieOptions.path}; Max-Age=${cookieOptions.maxAge}; HttpOnly; SameSite=${cookieOptions.sameSite}${cookieOptions.secure ? '; Secure' : ''}`,
              },
            }
          )
        } catch (error) {
          console.error('Register error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
