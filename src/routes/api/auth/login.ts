import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { login, SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const parsed = loginSchema.safeParse(body)

          if (!parsed.success) {
            return json(
              { error: 'Invalid input', details: parsed.error.flatten() },
              { status: 400 }
            )
          }

          const result = await login(parsed.data.email, parsed.data.password)

          if ('error' in result) {
            return json({ error: result.error }, { status: 401 })
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
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': `${SESSION_COOKIE_NAME}=${sessionId}; Path=${cookieOptions.path}; Max-Age=${cookieOptions.maxAge}; HttpOnly; SameSite=${cookieOptions.sameSite}${cookieOptions.secure ? '; Secure' : ''}`,
              },
            }
          )
        } catch (error) {
          console.error('Login error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
