import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Send,
  ImagePlus,
  Sparkles,
  Download,
  Plus,
  MessageSquare,
  X,
  Upload,
  Trash2,
  Bug,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  Maximize2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/generate/')({
  component: GeneratePage,
})

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content?: string | null
  imageUrl?: string | null
  imageData?: string | null
  createdAt: string
}

interface ChatSession {
  id: number
  title: string | null
  status: string
  createdAt: string
  updatedAt: string
}

function GeneratePage() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [imageSize, setImageSize] = useState<string>('1K')
  const [useGoogleSearch, setUseGoogleSearch] = useState(false)
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeJobIds, setActiveJobIds] = useState<Set<number>>(new Set())
  const [debugLogs, setDebugLogs] = useState<Array<{
    timestamp: string
    type: 'request' | 'response' | 'error' | 'info'
    message: string
    data?: any
  }>>([])
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState<string>('')
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/auth/login' })
    }
  }, [user, authLoading, navigate])

  // Prevent default drag and drop behavior on the page
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)

    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  // Fetch chat sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/ai/chat', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch sessions')
      return res.json()
    },
    enabled: !!user,
  })

  // Fetch current session messages
  const { data: sessionData, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ['chat-session', currentSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/ai/chat?sessionId=${currentSessionId}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch session')
      return res.json()
    },
    enabled: !!currentSessionId,
    refetchOnWindowFocus: true,
    refetchInterval: activeJobIds.size > 0 ? 2000 : false, // Poll every 2s while jobs are active
  })

  // Poll for active jobs
  useEffect(() => {
    if (activeJobIds.size === 0) {
      setIsGenerating(false)
      return
    }

    setIsGenerating(true)
    const interval = setInterval(async () => {
      const jobs = Array.from(activeJobIds)
      const completedJobs: number[] = []

      for (const jobId of jobs) {
        try {
          const res = await fetch(`/api/ai/chat?jobId=${jobId}`, {
            credentials: 'include',
          })
          if (res.ok) {
            const { job } = await res.json()
            if (job.status === 'completed' || job.status === 'failed') {
              completedJobs.push(jobId)
              if (job.status === 'completed') {
                // Refetch messages to show the new result
                await refetchMessages()
                setDebugLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toISOString(),
                    type: 'response',
                    message: `Job ${jobId} completed`,
                    data: { jobId, progress: job.progress, status: job.status },
                  },
                ])
              } else {
                setDebugLogs((prev) => [
                  ...prev,
                  {
                    timestamp: new Date().toISOString(),
                    type: 'error',
                    message: `Job ${jobId} failed`,
                    data: { jobId, error: job.errorMessage },
                  },
                ])
              }
            }
          }
        } catch (error) {
          console.error(`Error polling job ${jobId}:`, error)
        }
      }

      // Remove completed jobs from active set
      if (completedJobs.length > 0) {
        setActiveJobIds((prev) => {
          const newSet = new Set(prev)
          completedJobs.forEach((id) => newSet.delete(id))
          if (newSet.size === 0) {
            setIsGenerating(false)
          }
          return newSet
        })
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [activeJobIds, refetchMessages])

  // Clear optimistic messages when session changes
  useEffect(() => {
    setOptimisticMessages([])
    // Don't clear activeJobIds here - let the restore effect handle it
  }, [currentSessionId])

  // Restore active jobs when session loads or changes
  useEffect(() => {
    if (!currentSessionId) {
      setActiveJobIds(new Set())
      setIsGenerating(false)
      return
    }

    if (sessionData?.jobs) {
      const activeJobs = sessionData.jobs.filter(
        (job: any) => job.status === 'pending' || job.status === 'processing'
      )
      if (activeJobs.length > 0) {
        const jobIds = new Set(activeJobs.map((job: any) => job.id))
        setActiveJobIds(jobIds)
        setIsGenerating(true)
        
        // Add debug log
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: `Restored ${activeJobs.length} active job(s) for session ${currentSessionId}`,
            data: { jobIds: Array.from(jobIds), sessionId: currentSessionId },
          },
        ])
      } else {
        // No active jobs - clear state
        setActiveJobIds(new Set())
        setIsGenerating(false)
      }
    } else if (sessionData && !sessionData.jobs) {
      // Session loaded but no jobs data - clear state
      setActiveJobIds(new Set())
      setIsGenerating(false)
    }
  }, [currentSessionId, sessionData])

  // Create new session
  const createSession = useMutation({
    mutationFn: async (title?: string) => {
      const res = await fetch('/api/ai/chat?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: title || 'New Generation' }),
      })
      if (!res.ok) throw new Error('Failed to create session')
      return res.json()
    },
    onSuccess: (data) => {
      setCurrentSessionId(data.session.id)
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
    },
  })

  // Update session title
  const updateSessionTitle = useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: number; title: string }) => {
      const res = await fetch('/api/ai/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId, title }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update session title')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['chat-session', currentSessionId] })
      setEditingSessionId(null)
      setEditingTitle('')
    },
    onError: (error: Error) => {
      console.error('Failed to update session title:', error)
    },
  })

  const handleStartEdit = (session: ChatSession) => {
    setEditingSessionId(session.id)
    setEditingTitle(session.title || '')
  }

  const handleSaveEdit = (sessionId: number) => {
    if (editingTitle.trim()) {
      updateSessionTitle.mutate({ sessionId, title: editingTitle.trim() })
    } else {
      setEditingSessionId(null)
      setEditingTitle('')
    }
  }

  const handleCancelEdit = () => {
    setEditingSessionId(null)
    setEditingTitle('')
  }

  // Delete session
  const deleteSession = useMutation({
    mutationFn: async (sessionId: number) => {
      const res = await fetch(`/api/ai/chat?sessionId=${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete session')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      // If deleted session was current, clear it
      if (currentSessionId === deletingSessionId) {
        setCurrentSessionId(null)
        setOptimisticMessages([])
        setActiveJobIds(new Set())
        setIsGenerating(false)
      }
      setDeletingSessionId(null)
    },
    onError: (error: Error) => {
      console.error('Failed to delete session:', error)
      setDeletingSessionId(null)
    },
  })

  const handleDeleteClick = (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingSessionId(sessionId)
  }

  // Send message
  const sendMessage = useMutation({
    mutationFn: async (payload: { sessionId: number; message: string }) => {
      const startTime = Date.now()
      setIsGenerating(true)
      
      // Add debug log for request
      const requestData = {
        sessionId: payload.sessionId,
        message: payload.message,
        aspectRatio,
        imageSize,
        useGoogleSearch,
        referenceImagesCount: referenceImages.length,
      }
      
      setDebugLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          type: 'request',
          message: 'Sending generation request',
          data: requestData,
        },
      ])

      // Add optimistic user message
      const optimisticUserMessage: ChatMessage = {
        id: Date.now(), // Temporary ID
        role: 'user',
        content: payload.message,
        createdAt: new Date().toISOString(),
      }
      setOptimisticMessages((prev) => [...prev, optimisticUserMessage])

      try {
        const requestBody = {
          sessionId: payload.sessionId,
          message: payload.message,
          aspectRatio,
          imageSize,
          useGoogleSearch,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        }

        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: 'info',
            message: `Request payload prepared (${JSON.stringify(requestBody).length} bytes)`,
            data: { ...requestBody, referenceImages: requestBody.referenceImages ? `${requestBody.referenceImages.length} images` : undefined },
          },
        ])

        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(requestBody),
        })

        const requestDuration = Date.now() - startTime

        if (!res.ok) {
          const error = await res.json()
          
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: 'error',
              message: `Request failed: ${res.status} ${res.statusText}`,
              data: {
                error,
                duration: `${requestDuration}ms`,
                status: res.status,
              },
            },
          ])

          // Remove optimistic message on error
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticUserMessage.id))
          setIsGenerating(false)
          throw new Error(error.error || 'Failed to send message')
        }

        const responseData = await res.json()
        
        // Handle job-based response
        if (responseData.jobId) {
          setActiveJobIds((prev) => new Set(prev).add(responseData.jobId))
          setIsGenerating(true)
          
          setDebugLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              type: 'info',
              message: `Generation job ${responseData.jobId} created and queued`,
              data: {
                jobId: responseData.jobId,
                status: responseData.status,
                duration: `${requestDuration}ms`,
              },
            },
          ])

          return { jobId: responseData.jobId, status: 'pending' }
        }

        // Legacy response format (shouldn't happen with new API)
        const totalDuration = Date.now() - startTime

        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: 'response',
            message: 'Generation completed successfully',
            data: {
              hasText: !!responseData.text,
              hasImageData: !!responseData.imageData,
              hasImageUrl: !!responseData.imageUrl,
              imageDataSize: responseData.imageData ? `${Math.round(responseData.imageData.length / 1024)}KB` : undefined,
              duration: `${totalDuration}ms`,
              requestDuration: `${requestDuration}ms`,
            },
          },
        ])

        return responseData
      } catch (error: any) {
        const errorDuration = Date.now() - startTime
        
        setDebugLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            type: 'error',
            message: `Error: ${error.message || 'Unknown error'}`,
            data: {
              error: error.message,
              stack: error.stack,
              duration: `${errorDuration}ms`,
            },
          },
        ])
        
        throw error
      }
    },
    onSuccess: async (data) => {
      setReferenceImages([])
      // Don't clear optimistic messages or set isGenerating to false here
      // Let the polling handle completion
      // If it's a job-based response, polling will handle updates
      if (!data.jobId) {
        // Legacy immediate response - refetch messages
        setOptimisticMessages([])
        setIsGenerating(false)
        await refetchMessages()
        queryClient.invalidateQueries({ queryKey: ['chat-session', currentSessionId] })
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      }
    },
    onError: () => {
      setIsGenerating(false)
      setActiveJobIds(new Set())
      // Error handling already removes optimistic message in mutationFn
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || sendMessage.isPending) return

    const currentMessage = message
    setMessage('')

    if (!currentSessionId) {
      // Create session first, then send message
      try {
        const sessionResult = await createSession.mutateAsync(currentMessage.slice(0, 50))
        const newSessionId = sessionResult.session.id
        setCurrentSessionId(newSessionId)
        // Small delay to ensure session is set
        await new Promise((resolve) => setTimeout(resolve, 100))
        sendMessage.mutate({ sessionId: newSessionId, message: currentMessage })
      } catch (error) {
        console.error('Failed to create session:', error)
      }
    } else {
      sendMessage.mutate({ sessionId: currentSessionId, message: currentMessage })
    }
  }

  const processFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (referenceImages.length >= 14) return

      // Check if it's an image file
      if (!file.type.startsWith('image/')) {
        console.warn(`Skipping non-image file: ${file.name}`)
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = (e.target?.result as string)?.split(',')[1]
        if (base64) {
          setReferenceImages((prev) => [...prev, base64])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    processFiles(files)
    e.target.value = ''
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processFiles(files)
    }
  }

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
  }

  const downloadImage = async (imageUrl: string | null, imageData: string | null, filename: string) => {
    try {
      let blob: Blob
      let downloadUrl: string
      let shouldRevoke = false

      if (imageData) {
        // Handle base64 image
        const base64Content = imageData.includes(',') ? imageData.split(',')[1] : imageData
        const byteCharacters = atob(base64Content)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        blob = new Blob([byteArray], { type: 'image/png' })
        downloadUrl = URL.createObjectURL(blob)
        shouldRevoke = true
      } else if (imageUrl) {
        // Check if it's a data URL
        if (imageUrl.startsWith('data:')) {
          // Handle data URL - convert to blob
          const response = await fetch(imageUrl)
          blob = await response.blob()
          downloadUrl = URL.createObjectURL(blob)
          shouldRevoke = true
        } else {
          // Check if it's a same-origin URL
          const isSameOrigin = imageUrl.startsWith('/') || 
            (imageUrl.startsWith('http') && new URL(imageUrl).origin === window.location.origin)
          
          if (isSameOrigin) {
            // Same origin - safe to fetch
            const response = await fetch(imageUrl, { credentials: 'include' })
            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.statusText}`)
            }
            blob = await response.blob()
            downloadUrl = URL.createObjectURL(blob)
            shouldRevoke = true
          } else {
            // External URL - use proxy endpoint to avoid CORS
            try {
              const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(imageUrl)}`
              const response = await fetch(proxyUrl, { credentials: 'include' })
              if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to fetch via proxy')
              }
              const data = await response.json()
              // Proxy returns base64, convert to blob
              const base64Content = data.base64
              const byteCharacters = atob(base64Content)
              const byteNumbers = new Array(byteCharacters.length)
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i)
              }
              const byteArray = new Uint8Array(byteNumbers)
              blob = new Blob([byteArray], { type: data.mimeType || 'image/png' })
              downloadUrl = URL.createObjectURL(blob)
              shouldRevoke = true
            } catch (proxyError) {
              // Proxy failed, try direct download as last resort
              console.warn('Proxy failed, trying direct download:', proxyError)
              downloadUrl = imageUrl
            }
          }
        }
      } else {
        throw new Error('No image data available')
      }

      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      if (shouldRevoke) {
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 100)
      }
    } catch (error) {
      console.error('Error downloading image:', error)
      alert(`Failed to download image: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const sessions: ChatSession[] = sessionsData?.sessions || []
  const dbMessages: ChatMessage[] = sessionData?.messages || []
  
  // Combine database messages with optimistic messages
  // Filter out optimistic messages that have been saved (by checking if message exists in DB)
  const allMessages = [
    ...dbMessages,
    ...optimisticMessages.filter(
      (optMsg) => !dbMessages.some((dbMsg) => dbMsg.content === optMsg.content && dbMsg.role === optMsg.role)
    ),
  ]

  // Auto-scroll to bottom when messages change or generating
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages.length, isGenerating])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100dvh-3.5rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex overflow-hidden">
      {/* Sidebar - Chat Sessions */}
      <div className="w-72 border-r border-slate-800 bg-slate-900/50 backdrop-blur-sm flex flex-col h-full">
        <div className="p-4 border-b border-slate-800">
          <Button
            onClick={() => createSession.mutate()}
            disabled={createSession.isPending}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
          >
            {createSession.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            New Generation
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`w-full p-3 rounded-lg mb-1 transition-colors group ${
                currentSessionId === session.id
                  ? 'bg-indigo-600/20 border border-indigo-500/30'
                  : 'hover:bg-slate-800/50'
              }`}
            >
              {editingSessionId === session.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveEdit(session.id)
                      } else if (e.key === 'Escape') {
                        handleCancelEdit()
                      }
                    }}
                    className="flex-1 h-7 bg-slate-800 border-slate-700 text-slate-100 text-sm"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSaveEdit(session.id)
                    }}
                    disabled={updateSessionTitle.isPending}
                    className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                  >
                    {updateSessionTitle.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCancelEdit()
                    }}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setCurrentSessionId(session.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-200 truncate flex-1">
                      {session.title || 'Untitled'}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartEdit(session)
                        }}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleDeleteClick(session.id, e)}
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 mt-1 block">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              )}
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-slate-500 text-sm p-4">
              No sessions yet. Start a new generation!
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Chat Header */}
        <div className="shrink-0 p-4 border-b border-slate-800 bg-slate-900/30 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-indigo-400" />
              <h1 className="text-xl font-semibold text-slate-100">
                AI Image Generation
              </h1>
              <Badge variant="secondary" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                Gemini 3 Pro Image
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="text-slate-400 hover:text-slate-200"
            >
              <Bug className="h-4 w-4 mr-2" />
              Debug
              {showDebugPanel ? (
                <ChevronUp className="h-4 w-4 ml-2" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-2" />
              )}
            </Button>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebugPanel && (
          <div className="shrink-0 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm max-h-64 flex flex-col">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-medium text-slate-200">Debug Logs</span>
                <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
                  {debugLogs.length} entries
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDebugLogs([])}
                className="text-xs text-slate-400 hover:text-slate-200 h-7"
              >
                Clear
              </Button>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-3 space-y-2 font-mono text-xs">
                {debugLogs.length === 0 ? (
                  <div className="text-slate-500 text-center py-4">
                    No debug logs yet. Start generating to see logs.
                  </div>
                ) : (
                  debugLogs.map((log, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded border ${
                        log.type === 'error'
                          ? 'bg-red-500/10 border-red-500/30 text-red-300'
                          : log.type === 'response'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : log.type === 'request'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          : 'bg-slate-800/50 border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold">
                          [{log.type.toUpperCase()}] {log.message}
                        </span>
                        <span className="text-slate-500 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {log.data && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-slate-400 hover:text-slate-200 text-xs">
                            View details
                          </summary>
                          <pre className="mt-2 p-2 bg-slate-900/50 rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Messages Area */}
        <ScrollArea className="flex-1 min-h-0 p-4">
          {!currentSessionId ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/25">
                <ImagePlus className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-100 mb-2">
                Generate Amazing Images
              </h2>
              <p className="text-slate-400 max-w-md mb-6">
                Create and edit images conversationally using Google's Gemini AI.
                Upload reference images, adjust settings, and iterate on your creations.
              </p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <Card className="bg-slate-800/50 border-slate-700 p-4">
                  <div className="text-indigo-400 font-medium mb-1">Multi-turn Chat</div>
                  <p className="text-slate-500 text-xs">Iterate and refine images through conversation</p>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700 p-4">
                  <div className="text-purple-400 font-medium mb-1">Up to 14 References</div>
                  <p className="text-slate-500 text-xs">Mix multiple reference images for better results</p>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700 p-4">
                  <div className="text-cyan-400 font-medium mb-1">High Resolution</div>
                  <p className="text-slate-500 text-xs">Generate images up to 4K resolution</p>
                </Card>
              </div>
            </div>
          ) : messagesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full bg-slate-800" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3 bg-slate-800" />
                    <Skeleton className="h-20 w-full bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : allMessages.length === 0 && !isGenerating ? (
            <div className="h-full flex items-center justify-center text-slate-500">
              Send a message to start generating images
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl mx-auto pb-4">
              {allMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === 'user'
                        ? 'bg-indigo-600'
                        : 'bg-gradient-to-br from-purple-500 to-pink-500'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <span className="text-xs font-medium text-white">
                        {user?.name?.[0] || user?.email?.[0] || 'U'}
                      </span>
                    ) : (
                      <Sparkles className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <div
                    className={`flex-1 max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}
                  >
                    {msg.content && (
                      <div
                        className={`inline-block p-3 rounded-2xl ${
                          msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-tr-sm'
                            : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                        }`}
                      >
                        {msg.content}
                      </div>
                    )}
                    {(msg.imageUrl || msg.imageData) && (
                      <div className="mt-2 relative group inline-block">
                        <img
                          src={msg.imageUrl || `data:image/png;base64,${msg.imageData}`}
                          alt="Generated"
                          className="max-w-full rounded-xl shadow-lg max-h-96 object-contain cursor-pointer"
                          onClick={() => setPreviewImage(msg.imageUrl || `data:image/png;base64,${msg.imageData}`)}
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPreviewImage(msg.imageUrl || `data:image/png;base64,${msg.imageData}`)
                            }}
                          >
                            <Maximize2 className="h-4 w-4 mr-1" />
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation()
                              downloadImage(
                                msg.imageUrl,
                                msg.imageData,
                                `generated-${msg.id}.png`
                              )
                            }}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}

              {/* Show AI generating indicator */}
              {isGenerating && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="inline-flex items-center gap-3 p-4 rounded-2xl bg-slate-800/80 text-slate-300 rounded-tl-sm border border-slate-700/50">
                      <div className="relative">
                        <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        <Sparkles className="h-3 w-3 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Generating your image...</span>
                        <span className="text-xs text-slate-500">This may take a moment</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Reference Images Preview */}
        {referenceImages.length > 0 && (
          <div className="shrink-0 px-4 py-2 border-t border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-slate-500 shrink-0">
                Reference images ({referenceImages.length}/14):
              </span>
              {referenceImages.map((img, i) => (
                <div key={i} className="relative group shrink-0">
                  <img
                    src={`data:image/jpeg;base64,${img}`}
                    alt={`Reference ${i + 1}`}
                    className="h-12 w-12 object-cover rounded-lg border border-slate-700"
                  />
                  <button
                    onClick={() => removeReferenceImage(i)}
                    className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Area - Always visible at bottom */}
        <div 
          className={`shrink-0 p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm transition-colors relative ${
            isDragging ? 'bg-indigo-900/50 border-indigo-500/50' : ''
          }`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-indigo-500/10 border-2 border-dashed border-indigo-500 rounded-lg flex items-center justify-center z-50 pointer-events-none m-4">
              <div className="text-center">
                <Upload className="h-12 w-12 text-indigo-400 mx-auto mb-2" />
                <p className="text-indigo-300 font-medium">Drop images here to add as references</p>
                <p className="text-indigo-400 text-sm mt-1">Up to 14 reference images</p>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative z-10">
            {/* Settings Row */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-400">Aspect:</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger className="w-24 h-8 bg-slate-800 border-slate-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">1:1</SelectItem>
                    <SelectItem value="3:4">3:4</SelectItem>
                    <SelectItem value="4:3">4:3</SelectItem>
                    <SelectItem value="9:16">9:16</SelectItem>
                    <SelectItem value="16:9">16:9</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-400">Size:</Label>
                <Select value={imageSize} onValueChange={setImageSize}>
                  <SelectTrigger className="w-20 h-8 bg-slate-800 border-slate-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1K">1K</SelectItem>
                    <SelectItem value="2K">2K</SelectItem>
                    <SelectItem value="4K">4K</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant={useGoogleSearch ? 'default' : 'outline'}
                size="sm"
                onClick={() => setUseGoogleSearch(!useGoogleSearch)}
                className={useGoogleSearch ? 'bg-indigo-600' : 'border-slate-700'}
              >
                Google Search
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                multiple
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={referenceImages.length >= 14}
                className="border-slate-700"
              >
                <Upload className="h-4 w-4 mr-1" />
                Add Reference
              </Button>
            </div>

            {/* Message Input */}
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={sendMessage.isPending ? "Generating image..." : "Describe the image you want to generate..."}
                className="flex-1 bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 h-12"
                disabled={sendMessage.isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (message.trim() && !sendMessage.isPending) {
                      handleSubmit(e)
                    }
                  }
                }}
              />
              <Button
                type="submit"
                disabled={!message.trim() || sendMessage.isPending}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-6 h-12"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

            {sendMessage.error && (
              <div className="mt-2 text-sm text-red-400">
                {sendMessage.error.message}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingSessionId} onOpenChange={(open) => !open && setDeletingSessionId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Delete Chat Session</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete this chat session? This will permanently delete all messages and generated images in this session. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingSessionId && deleteSession.mutate(deletingSessionId)}
              disabled={deleteSession.isPending}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {deleteSession.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-800 shrink-0">
            <DialogTitle className="text-slate-100 flex items-center justify-between">
              <span>Image Preview</span>
              {previewImage && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const url = previewImage
                    const isBase64 = url.startsWith('data:')
                    downloadImage(
                      isBase64 ? null : url,
                      isBase64 ? url.split(',')[1] : null,
                      `preview-${Date.now()}.png`
                    )
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center min-h-0">
            {previewImage && (
              <img
                src={previewImage}
                alt="Preview"
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

