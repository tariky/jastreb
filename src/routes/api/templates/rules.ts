import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions, satoriTemplates, templateRules } from '@/db/schema'
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

export const Route = createFileRoute('/api/templates/rules')({
  server: {
    handlers: {
      // GET - List all rules (optionally by template)
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const templateId = url.searchParams.get('templateId')

        try {
          let query = db
            .select({
              rule: templateRules,
              template: satoriTemplates,
            })
            .from(templateRules)
            .leftJoin(satoriTemplates, eq(templateRules.templateId, satoriTemplates.id))
            .where(eq(templateRules.userId, user.id))
            .orderBy(desc(templateRules.priority), desc(templateRules.createdAt))

          if (templateId) {
            query = db
              .select({
                rule: templateRules,
                template: satoriTemplates,
              })
              .from(templateRules)
              .leftJoin(satoriTemplates, eq(templateRules.templateId, satoriTemplates.id))
              .where(and(eq(templateRules.userId, user.id), eq(templateRules.templateId, parseInt(templateId))))
              .orderBy(desc(templateRules.priority), desc(templateRules.createdAt))
          }

          const results = await query.all()
          const rules = results.map((r) => ({
            ...r.rule,
            templateName: r.template?.name,
          }))

          return json({ rules })
        } catch (error: any) {
          console.error('Get rules error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // POST - Create new rule
      POST: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { templateId, name, description, priority, isActive, conditions } = body

          if (!templateId || !name) {
            return json({ error: 'Template ID and name are required' }, { status: 400 })
          }

          // Verify template ownership
          const template = await db
            .select()
            .from(satoriTemplates)
            .where(and(eq(satoriTemplates.id, templateId), eq(satoriTemplates.userId, user.id)))
            .get()

          if (!template) {
            return json({ error: 'Template not found' }, { status: 404 })
          }

          const [newRule] = await db
            .insert(templateRules)
            .values({
              userId: user.id,
              templateId,
              name,
              description,
              priority: priority || 0,
              isActive: isActive !== false,
              conditions: conditions || {},
            })
            .returning()

          return json({ rule: newRule }, { status: 201 })
        } catch (error: any) {
          console.error('Create rule error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // PUT - Update rule
      PUT: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { id, templateId, name, description, priority, isActive, conditions } = body

          if (!id) {
            return json({ error: 'Rule ID required' }, { status: 400 })
          }

          // Verify ownership
          const existing = await db
            .select()
            .from(templateRules)
            .where(and(eq(templateRules.id, id), eq(templateRules.userId, user.id)))
            .get()

          if (!existing) {
            return json({ error: 'Rule not found' }, { status: 404 })
          }

          // If changing template, verify new template ownership
          if (templateId && templateId !== existing.templateId) {
            const template = await db
              .select()
              .from(satoriTemplates)
              .where(and(eq(satoriTemplates.id, templateId), eq(satoriTemplates.userId, user.id)))
              .get()

            if (!template) {
              return json({ error: 'Template not found' }, { status: 404 })
            }
          }

          const [updated] = await db
            .update(templateRules)
            .set({
              ...(templateId !== undefined && { templateId }),
              ...(name !== undefined && { name }),
              ...(description !== undefined && { description }),
              ...(priority !== undefined && { priority }),
              ...(isActive !== undefined && { isActive }),
              ...(conditions !== undefined && { conditions }),
              updatedAt: new Date(),
            })
            .where(eq(templateRules.id, id))
            .returning()

          return json({ rule: updated })
        } catch (error: any) {
          console.error('Update rule error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // DELETE - Delete rule
      DELETE: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const ruleId = url.searchParams.get('id')

        if (!ruleId) {
          return json({ error: 'Rule ID required' }, { status: 400 })
        }

        try {
          // Verify ownership
          const existing = await db
            .select()
            .from(templateRules)
            .where(and(eq(templateRules.id, parseInt(ruleId)), eq(templateRules.userId, user.id)))
            .get()

          if (!existing) {
            return json({ error: 'Rule not found' }, { status: 404 })
          }

          await db.delete(templateRules).where(eq(templateRules.id, parseInt(ruleId)))

          return json({ success: true })
        } catch (error: any) {
          console.error('Delete rule error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
