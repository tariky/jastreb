import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions, satoriTemplates, templateRules, productTemplateAssignments, products } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

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

// Check if a product matches rule conditions
function productMatchesRule(
  product: typeof products.$inferSelect,
  conditions: NonNullable<typeof templateRules.$inferSelect['conditions']>
): boolean {
  // Categories check
  if (conditions.categories?.length) {
    const productCategories = product.categories || []
    const hasMatchingCategory = conditions.categories.some((cat) =>
      productCategories.some((pc) => pc.toLowerCase().includes(cat.toLowerCase()))
    )
    if (!hasMatchingCategory) return false
  }

  // Tags check
  if (conditions.tags?.length) {
    const productTags = product.tags || []
    const hasMatchingTag = conditions.tags.some((tag) =>
      productTags.some((pt) => pt.toLowerCase().includes(tag.toLowerCase()))
    )
    if (!hasMatchingTag) return false
  }

  // Price range check
  const price = parseFloat(product.price || '0')
  if (conditions.priceMin !== undefined && price < conditions.priceMin) return false
  if (conditions.priceMax !== undefined && price > conditions.priceMax) return false

  // Stock status check
  if (conditions.stockStatus?.length) {
    if (!product.stockStatus || !conditions.stockStatus.includes(product.stockStatus as any)) {
      return false
    }
  }

  // Product type check
  if (conditions.productType?.length) {
    if (!product.productType || !conditions.productType.includes(product.productType as any)) {
      return false
    }
  }

  // SKU pattern check
  if (conditions.skuPattern) {
    try {
      const regex = new RegExp(conditions.skuPattern, 'i')
      if (!product.sku || !regex.test(product.sku)) return false
    } catch {
      // Invalid regex, skip this check
    }
  }

  // Name pattern check
  if (conditions.namePattern) {
    try {
      const regex = new RegExp(conditions.namePattern, 'i')
      if (!regex.test(product.name)) return false
    } catch {
      // Invalid regex, skip this check
    }
  }

  return true
}

export const Route = createFileRoute('/api/templates/assignments')({
  server: {
    handlers: {
      // GET - Get assignments for a product or list all
      GET: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const productId = url.searchParams.get('productId')

        try {
          if (productId) {
            // Get assignments for specific product
            const assignments = await db
              .select({
                assignment: productTemplateAssignments,
                template: satoriTemplates,
              })
              .from(productTemplateAssignments)
              .leftJoin(satoriTemplates, eq(productTemplateAssignments.templateId, satoriTemplates.id))
              .where(eq(productTemplateAssignments.productId, parseInt(productId)))
              .all()

            return json({
              assignments: assignments.map((a) => ({
                ...a.assignment,
                template: a.template,
              })),
            })
          }

          // List all assignments for user's products
          const userProducts = await db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.userId, user.id))
            .all()

          const productIds = userProducts.map((p) => p.id)

          if (productIds.length === 0) {
            return json({ assignments: [] })
          }

          const assignments = await db
            .select({
              assignment: productTemplateAssignments,
              template: satoriTemplates,
              product: products,
            })
            .from(productTemplateAssignments)
            .leftJoin(satoriTemplates, eq(productTemplateAssignments.templateId, satoriTemplates.id))
            .leftJoin(products, eq(productTemplateAssignments.productId, products.id))
            .where(inArray(productTemplateAssignments.productId, productIds))
            .all()

          return json({
            assignments: assignments.map((a) => ({
              ...a.assignment,
              template: a.template,
              productName: a.product?.name,
            })),
          })
        } catch (error: any) {
          console.error('Get assignments error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // POST - Create assignment (manual or auto via rules)
      POST: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { productId, templateId, customVariables, applyRules } = body

          // Auto-apply rules to a product
          if (applyRules && productId) {
            const product = await db
              .select()
              .from(products)
              .where(and(eq(products.id, productId), eq(products.userId, user.id)))
              .get()

            if (!product) {
              return json({ error: 'Product not found' }, { status: 404 })
            }

            // Get active rules sorted by priority
            const rules = await db
              .select()
              .from(templateRules)
              .where(and(eq(templateRules.userId, user.id), eq(templateRules.isActive, true)))
              .orderBy(templateRules.priority)
              .all()

            // Find first matching rule
            for (const rule of rules.reverse()) {
              // Reverse for highest priority first
              if (rule.conditions && productMatchesRule(product, rule.conditions)) {
                // Check if assignment already exists
                const existing = await db
                  .select()
                  .from(productTemplateAssignments)
                  .where(
                    and(
                      eq(productTemplateAssignments.productId, productId),
                      eq(productTemplateAssignments.templateId, rule.templateId)
                    )
                  )
                  .get()

                if (!existing) {
                  const [assignment] = await db
                    .insert(productTemplateAssignments)
                    .values({
                      productId,
                      templateId: rule.templateId,
                      customVariables: customVariables || {},
                    })
                    .returning()

                  return json({ assignment, matchedRule: rule.name }, { status: 201 })
                }

                return json({ message: 'Assignment already exists', matchedRule: rule.name })
              }
            }

            return json({ message: 'No matching rules found' })
          }

          // Manual assignment
          if (!productId || !templateId) {
            return json({ error: 'Product ID and Template ID required' }, { status: 400 })
          }

          // Verify product ownership
          const product = await db
            .select()
            .from(products)
            .where(and(eq(products.id, productId), eq(products.userId, user.id)))
            .get()

          if (!product) {
            return json({ error: 'Product not found' }, { status: 404 })
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

          // Check if assignment already exists
          const existing = await db
            .select()
            .from(productTemplateAssignments)
            .where(
              and(eq(productTemplateAssignments.productId, productId), eq(productTemplateAssignments.templateId, templateId))
            )
            .get()

          if (existing) {
            // Update existing
            const [updated] = await db
              .update(productTemplateAssignments)
              .set({ customVariables: customVariables || {} })
              .where(eq(productTemplateAssignments.id, existing.id))
              .returning()

            return json({ assignment: updated })
          }

          const [assignment] = await db
            .insert(productTemplateAssignments)
            .values({
              productId,
              templateId,
              customVariables: customVariables || {},
            })
            .returning()

          return json({ assignment }, { status: 201 })
        } catch (error: any) {
          console.error('Create assignment error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },

      // DELETE - Remove assignment
      DELETE: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const assignmentId = url.searchParams.get('id')
        const productId = url.searchParams.get('productId')
        const templateId = url.searchParams.get('templateId')

        try {
          if (assignmentId) {
            // Delete by assignment ID
            const assignment = await db
              .select()
              .from(productTemplateAssignments)
              .where(eq(productTemplateAssignments.id, parseInt(assignmentId)))
              .get()

            if (!assignment) {
              return json({ error: 'Assignment not found' }, { status: 404 })
            }

            // Verify product ownership
            const product = await db
              .select()
              .from(products)
              .where(and(eq(products.id, assignment.productId), eq(products.userId, user.id)))
              .get()

            if (!product) {
              return json({ error: 'Unauthorized' }, { status: 403 })
            }

            await db.delete(productTemplateAssignments).where(eq(productTemplateAssignments.id, parseInt(assignmentId)))
          } else if (productId && templateId) {
            // Delete by product and template IDs
            const product = await db
              .select()
              .from(products)
              .where(and(eq(products.id, parseInt(productId)), eq(products.userId, user.id)))
              .get()

            if (!product) {
              return json({ error: 'Product not found' }, { status: 404 })
            }

            await db
              .delete(productTemplateAssignments)
              .where(
                and(
                  eq(productTemplateAssignments.productId, parseInt(productId)),
                  eq(productTemplateAssignments.templateId, parseInt(templateId))
                )
              )
          } else {
            return json({ error: 'Assignment ID or Product+Template IDs required' }, { status: 400 })
          }

          return json({ success: true })
        } catch (error: any) {
          console.error('Delete assignment error:', error)
          return json({ error: error.message }, { status: 500 })
        }
      },
    },
  },
})
