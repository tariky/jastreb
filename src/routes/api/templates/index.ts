import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions, satoriTemplates, templateRules, productTemplateAssignments, products } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

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

export const Route = createFileRoute('/api/templates/')({
  server: {
    handlers: {
      // GET - List all templates
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const templates = await db
            .select()
            .from(satoriTemplates)
            .where(eq(satoriTemplates.userId, user.id))
            .orderBy(desc(satoriTemplates.createdAt))
            .all()

          return json({ templates })
        } catch (error: any) {
          console.error('Get templates error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // POST - Create new template
      POST: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { name, description, width, height, template, styles, variables, isDefault } = body

          if (!name || !template) {
            return json({ error: 'Name and template content are required' }, { status: 400 })
          }

          // If setting as default, unset other defaults
          if (isDefault) {
            await db
              .update(satoriTemplates)
              .set({ isDefault: false })
              .where(eq(satoriTemplates.userId, user.id))
          }

          const [newTemplate] = await db
            .insert(satoriTemplates)
            .values({
              userId: user.id,
              name,
              description,
              width: width || 1200,
              height: height || 630,
              template,
              styles: styles || {},
              variables: variables || [],
              isDefault: isDefault || false,
            })
            .returning()

          return json({ template: newTemplate }, { status: 201 })
        } catch (error: any) {
          console.error('Create template error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // PUT - Update template
      PUT: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { id, name, description, width, height, template, styles, variables, isDefault, previewUrl } = body

          if (!id) {
            return json({ error: 'Template ID required' }, { status: 400 })
          }

          // Verify ownership
          const existing = await db
            .select()
            .from(satoriTemplates)
            .where(and(eq(satoriTemplates.id, id), eq(satoriTemplates.userId, user.id)))
            .get()

          if (!existing) {
            return json({ error: 'Template not found' }, { status: 404 })
          }

          // If setting as default, unset other defaults
          if (isDefault) {
            await db
              .update(satoriTemplates)
              .set({ isDefault: false })
              .where(eq(satoriTemplates.userId, user.id))
          }

          const [updated] = await db
            .update(satoriTemplates)
            .set({
              ...(name !== undefined && { name }),
              ...(description !== undefined && { description }),
              ...(width !== undefined && { width }),
              ...(height !== undefined && { height }),
              ...(template !== undefined && { template }),
              ...(styles !== undefined && { styles }),
              ...(variables !== undefined && { variables }),
              ...(isDefault !== undefined && { isDefault }),
              ...(previewUrl !== undefined && { previewUrl }),
            })
            .where(eq(satoriTemplates.id, id))
            .returning()

          return json({ template: updated })
        } catch (error: any) {
          console.error('Update template error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // DELETE - Delete template
      DELETE: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const templateId = url.searchParams.get('id')

        if (!templateId) {
          return json({ error: 'Template ID required' }, { status: 400 })
        }

        try {
          // Verify ownership
          const existing = await db
            .select()
            .from(satoriTemplates)
            .where(and(eq(satoriTemplates.id, parseInt(templateId)), eq(satoriTemplates.userId, user.id)))
            .get()

          if (!existing) {
            return json({ error: 'Template not found' }, { status: 404 })
          }

          await db.delete(satoriTemplates).where(eq(satoriTemplates.id, parseInt(templateId)))

          return json({ success: true })
        } catch (error: any) {
          console.error('Delete template error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
