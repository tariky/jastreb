import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { validateSession, SESSION_COOKIE_NAME } from '@/lib/auth'

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const cookieHeader = request.headers.get('cookie') || ''
          const cookies = Object.fromEntries(
            cookieHeader.split(';').map((c) => {
              const [key, ...val] = c.trim().split('=')
              return [key, val.join('=')]
            })
          )

          const sessionId = cookies[SESSION_COOKIE_NAME]

          if (!sessionId) {
            return json({ user: null })
          }

          const user = await validateSession(sessionId)

          if (!user) {
            return new Response(JSON.stringify({ user: null }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=lax`,
              },
            })
          }

          return json({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              isAdmin: user.isAdmin || false,
            },
          })
        } catch (error) {
          console.error('Auth check error:', error)
          return json({ user: null })
        }
      },
    },
  },
})
