import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { invalidateSession, SESSION_COOKIE_NAME } from '@/lib/auth'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const cookieHeader = request.headers.get('cookie') || ''
          const cookies = Object.fromEntries(
            cookieHeader.split(';').map((c) => {
              const [key, ...val] = c.trim().split('=')
              return [key, val.join('=')]
            })
          )

          const sessionId = cookies[SESSION_COOKIE_NAME]

          if (sessionId) {
            await invalidateSession(sessionId)
          }

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=lax`,
            },
          })
        } catch (error) {
          console.error('Logout error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
