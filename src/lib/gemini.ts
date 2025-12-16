import { GoogleGenAI } from '@google/genai'
import { db } from '@/db'
import { aiChatSessions, aiChatMessages, users, generationJobs } from '@/db/schema'
import { eq, and, or } from 'drizzle-orm'
import { uploadChatImage, smartUploadBase64Image } from '@/lib/storage'

// ============================================================================
// Types
// ============================================================================

export interface ImageGenerationConfig {
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
  imageSize?: '1K' | '2K' | '4K'
  useGoogleSearch?: boolean
}

export interface GenerationResult {
  text?: string
  imageData?: string
  imageUrl?: string
  error?: string
}

// ============================================================================
// User-specific API Key Management
// ============================================================================

// Cache for user-specific AI clients
const userAIClients = new Map<number, GoogleGenAI>()

async function getUserApiKey(userId: number): Promise<string | null> {
  const user = await db
    .select({ googleAiApiKey: users.googleAiApiKey })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  return user?.googleAiApiKey || null
}

async function getAIClient(userId: number): Promise<GoogleGenAI> {
  if (userAIClients.has(userId)) {
    return userAIClients.get(userId)!
  }

  const userApiKey = await getUserApiKey(userId)
  const apiKey = userApiKey || process.env.GOOGLE_AI_API_KEY

  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY environment variable or user-specific API key is not set')
  }

  const client = new GoogleGenAI({ apiKey })
  userAIClients.set(userId, client)
  return client
}

export function clearUserAIClient(userId: number) {
  userAIClients.delete(userId)
}

// ============================================================================
// Chat Session Management
// ============================================================================

export async function createChatSession(
  userId: number,
  productId?: number,
  title?: string
): Promise<number> {
  const [session] = await db
    .insert(aiChatSessions)
    .values({
      userId,
      productId: productId || null,
      title: title || null,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return session.id
}

export async function getChatSession(sessionId: number) {
  return db
    .select()
    .from(aiChatSessions)
    .where(eq(aiChatSessions.id, sessionId))
    .get()
}

export async function getChatMessages(sessionId: number) {
  return db
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.sessionId, sessionId))
    .orderBy(aiChatMessages.createdAt)
}

export async function archiveChatSession(sessionId: number): Promise<void> {
  await db
    .update(aiChatSessions)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(aiChatSessions.id, sessionId))
}

export async function deleteChatSession(sessionId: number): Promise<void> {
  // Delete generation jobs associated with this session first
  await db
    .delete(generationJobs)
    .where(eq(generationJobs.sessionId, sessionId))

  // Delete the session (messages will be cascade deleted due to foreign key)
  await db
    .delete(aiChatSessions)
    .where(eq(aiChatSessions.id, sessionId))
}

export async function updateChatSessionTitle(sessionId: number, title: string): Promise<void> {
  await db
    .update(aiChatSessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(aiChatSessions.id, sessionId))
}

// ============================================================================
// Image Generation
// ============================================================================

export async function generateImage(
  prompt: string,
  config: ImageGenerationConfig = {},
  referenceImages?: string[],
  userId?: number
): Promise<GenerationResult> {
  try {
    if (!userId) {
      throw new Error('User ID is required for image generation')
    }

    const ai = await getAIClient(userId)

    // Prepare contents with text and reference images
    const parts: any[] = [{ text: prompt }]
    
    if (referenceImages && referenceImages.length > 0) {
      parts.push(
        ...referenceImages.map((img) => ({
          inlineData: {
            mimeType: 'image/jpeg',
            data: img,
          },
        }))
      )
    }

    // Prepare config
    const generationConfig: any = {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: config.aspectRatio || '1:1',
        imageSize: config.imageSize || '1K',
      },
    }

    // Add Google Search tool if enabled
    const tools = config.useGoogleSearch ? [{ googleSearch: {} }] : undefined

    // Generate content
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: parts,
      config: {
        ...generationConfig,
        ...(tools && { tools }),
      },
    })

    // Extract text and image from response parts
    let text: string | undefined
    let imageData: string | undefined

    // Properly iterate through response parts to avoid SDK warning
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0]
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if ('text' in part && part.text) {
            text = text ? text + part.text : part.text
          }
          if ('inlineData' in part && part.inlineData) {
            // Extract base64 image data
            imageData = part.inlineData.data
          }
        }
      }
    }

    // Fallback to SDK helpers if parts iteration didn't work
    if (!text && !imageData) {
      try {
        text = response.text
      } catch (e) {
        // Ignore - may not have text
      }
      try {
        imageData = (response as any).data
      } catch (e) {
        // Ignore - may not have image
      }
    }

    return {
      text,
      imageData,
    }
  } catch (error: any) {
    console.error('Image generation error:', error)
    return {
      error: error.message || 'Failed to generate image',
    }
  }
}

// ============================================================================
// Chat Message Handling
// ============================================================================

// ============================================================================
// Generation Job Management
// ============================================================================

export async function createGenerationJob(
  userId: number,
  sessionId: number,
  message: string,
  config: ImageGenerationConfig = {},
  referenceImages?: string[]
): Promise<number> {
  // Get session to verify it exists
  const session = await getChatSession(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  // Save user message first
  const [userMessage] = await db
    .insert(aiChatMessages)
    .values({
      sessionId,
      role: 'user',
      content: message,
      createdAt: new Date(),
    })
    .returning()

  // Create generation job
  const [job] = await db
    .insert(generationJobs)
    .values({
      userId,
      type: 'gemini',
      status: 'pending',
      sessionId,
      messageId: userMessage.id,
      input: {
        message,
        config,
        referenceImages: referenceImages || [],
        referenceImagesCount: referenceImages?.length || 0,
      },
      progress: 0,
      createdAt: new Date(),
    })
    .returning()

  // Process job asynchronously (don't await)
  processGenerationJob(job.id).catch((error) => {
    console.error(`Error processing job ${job.id}:`, error)
  })

  return job.id
}

export async function getGenerationJob(jobId: number) {
  return db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId))
    .get()
}

export async function getGenerationJobsBySession(sessionId: number) {
  return db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.sessionId, sessionId))
    .orderBy(generationJobs.createdAt)
}

export async function getActiveGenerationJobs(userId: number) {
  return db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.userId, userId),
        or(
          eq(generationJobs.status, 'pending'),
          eq(generationJobs.status, 'processing')
        )
      )
    )
    .orderBy(generationJobs.createdAt)
}

export async function getUserGenerationJobs(userId: number, status?: 'pending' | 'processing' | 'completed' | 'failed') {
  const conditions = [eq(generationJobs.userId, userId)]
  if (status) {
    conditions.push(eq(generationJobs.status, status))
  }
  return db
    .select()
    .from(generationJobs)
    .where(and(...conditions))
    .orderBy(generationJobs.createdAt)
}

// Background job processor
async function processGenerationJob(jobId: number) {
  try {
    // Get job
    const job = await getGenerationJob(jobId)
    if (!job || job.status !== 'pending') {
      return
    }

    // Update status to processing
    await db
      .update(generationJobs)
      .set({
        status: 'processing',
        startedAt: new Date(),
        progress: 10,
      })
      .where(eq(generationJobs.id, jobId))

    // Get session and user message
    const session = await getChatSession(job.sessionId!)
    if (!session) {
      throw new Error('Session not found')
    }

    const input = job.input as any
    const message = input.message
    const config: ImageGenerationConfig = input.config || {}
    const referenceImages = input.referenceImages || []

    // Update progress
    await db
      .update(generationJobs)
      .set({ progress: 30 })
      .where(eq(generationJobs.id, jobId))

    // Generate image
    const result = await generateImage(message, config, referenceImages, job.userId)

    if (result.error) {
      // Save error message to chat
      await db
        .insert(aiChatMessages)
        .values({
          sessionId: job.sessionId!,
          role: 'assistant',
          content: `❌ **Generation Failed**\n\n${result.error}\n\nPlease check your API key settings or try again.`,
          metadata: { jobId, error: true },
          createdAt: new Date(),
        })

      // Update job with error
      await db
        .update(generationJobs)
        .set({
          status: 'failed',
          errorMessage: result.error,
          completedAt: new Date(),
          progress: 100,
        })
        .where(eq(generationJobs.id, jobId))

      // Update session timestamp
      await db
        .update(aiChatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(aiChatSessions.id, job.sessionId!))

      return
    }

    // Update progress
    await db
      .update(generationJobs)
      .set({ progress: 80 })
      .where(eq(generationJobs.id, jobId))

    // Upload image to S3/local storage if imageData exists
    let uploadedImageUrl: string | null = null
    if (result.imageData) {
      try {
        // Use product-specific upload if productId exists, otherwise use chat upload
        const uploadResult = session.productId
          ? await smartUploadBase64Image(
              result.imageData,
              job.userId,
              session.productId,
              `ai-generated-${jobId}-${Date.now()}.png`
            )
          : await uploadChatImage(
              result.imageData,
              job.userId,
              `ai-generated-${jobId}-${Date.now()}.png`
            )
        uploadedImageUrl = uploadResult.url
      } catch (error: any) {
        console.error(`Error uploading generated image for job ${jobId}:`, error)
        // Continue with base64 fallback if upload fails
      }
    }

    // Save assistant response
    const [assistantMessage] = await db
      .insert(aiChatMessages)
      .values({
        sessionId: job.sessionId!,
        role: 'assistant',
        content: result.text || null,
        imageUrl: uploadedImageUrl || result.imageUrl || null,
        imageData: uploadedImageUrl ? null : result.imageData || null, // Only store base64 if upload failed
        metadata: { jobId, uploadedToStorage: !!uploadedImageUrl },
        createdAt: new Date(),
      })
      .returning()

    // Update session timestamp
    await db
      .update(aiChatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(aiChatSessions.id, job.sessionId!))

    // Update job as completed
    await db
      .update(generationJobs)
      .set({
        status: 'completed',
        output: {
          text: result.text,
          hasImageData: !!result.imageData,
          hasImageUrl: !!result.imageUrl,
          messageId: assistantMessage.id,
        },
        completedAt: new Date(),
        progress: 100,
      })
      .where(eq(generationJobs.id, jobId))
  } catch (error: any) {
    console.error(`Failed to process generation job ${jobId}:`, error)
    
    const errorMessage = error.message || 'Unknown error during processing'
    
    // Try to save error message to chat if we have session info
    try {
      const job = await getGenerationJob(jobId)
      if (job?.sessionId) {
        await db
          .insert(aiChatMessages)
          .values({
            sessionId: job.sessionId,
            role: 'assistant',
            content: `❌ **Generation Failed**\n\n${errorMessage}\n\nPlease check your API key settings or try again.`,
            metadata: { jobId, error: true },
            createdAt: new Date(),
          })

        // Update session timestamp
        await db
          .update(aiChatSessions)
          .set({ updatedAt: new Date() })
          .where(eq(aiChatSessions.id, job.sessionId))
      }
    } catch (chatError) {
      console.error('Failed to save error message to chat:', chatError)
    }

    // Update job with error
    await db
      .update(generationJobs)
      .set({
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
        progress: 100,
      })
      .where(eq(generationJobs.id, jobId))
  }
}

// ============================================================================
// Chat Message Handling (Legacy - for immediate processing)
// ============================================================================

export async function sendChatMessage(
  sessionId: number,
  message: string,
  config: ImageGenerationConfig = {},
  referenceImages?: string[]
): Promise<GenerationResult> {
  try {
    // Get session to find userId
    const session = await getChatSession(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    // Save user message
    await db.insert(aiChatMessages).values({
      sessionId,
      role: 'user',
      content: message,
      createdAt: new Date(),
    })

    // Generate image
    const result = await generateImage(message, config, referenceImages, session.userId)

    // Save assistant response
    await db.insert(aiChatMessages).values({
      sessionId,
      role: 'assistant',
      content: result.text || null,
      imageUrl: result.imageUrl || null,
      imageData: result.imageData || null,
      createdAt: new Date(),
    })

    // Update session timestamp
    await db
      .update(aiChatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(aiChatSessions.id, sessionId))

    return result
  } catch (error: any) {
    console.error('Chat message error:', error)
    return {
      error: error.message || 'Failed to send message',
    }
  }
}

