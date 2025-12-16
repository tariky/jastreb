import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { hasAnyUsers } from '@/lib/auth'

export const Route = createFileRoute('/api/auth/registration-status')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const usersExist = await hasAnyUsers()
          return json({ registrationEnabled: !usersExist })
        } catch (error) {
          console.error('Registration status error:', error)
          return json({ registrationEnabled: false }, { status: 500 })
        }
      },
    },
  },
})
