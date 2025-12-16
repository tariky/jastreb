import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import satori from 'satori'
import sharp from 'sharp'

// Cache for converted images to avoid re-fetching
const imageCache = new Map<string, string>()

// Fetch image URL and convert to base64 JPEG using Sharp
async function fetchAndConvertImage(url: string): Promise<string> {
  // Check cache first
  if (imageCache.has(url)) {
    return imageCache.get(url)!
  }

  try {
    // Skip if already a data URL
    if (url.startsWith('data:')) {
      return url
    }

    // Fetch the image
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`Failed to fetch image: ${url}`)
      return url // Return original URL as fallback
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Convert to JPEG using Sharp
    const jpegBuffer = await sharp(buffer)
      .jpeg({ quality: 85 })
      .toBuffer()

    // Convert to base64 data URL
    const base64 = jpegBuffer.toString('base64')
    const dataUrl = `data:image/jpeg;base64,${base64}`

    // Cache the result (limit cache size)
    if (imageCache.size > 100) {
      // Clear oldest entries
      const firstKey = imageCache.keys().next().value
      if (firstKey) imageCache.delete(firstKey)
    }
    imageCache.set(url, dataUrl)

    return dataUrl
  } catch (error) {
    console.error(`Error converting image ${url}:`, error)
    return url // Return original URL as fallback
  }
}

// Find all image URLs in the template and convert them
async function processTemplateImages(template: string): Promise<string> {
  // Find all src="..." attributes that contain URLs
  const srcRegex = /src="(https?:\/\/[^"]+)"/g
  const matches = [...template.matchAll(srcRegex)]
  
  if (matches.length === 0) {
    return template
  }

  // Convert all images in parallel
  const conversions = await Promise.all(
    matches.map(async (match) => {
      const originalUrl = match[1]
      const base64Url = await fetchAndConvertImage(originalUrl)
      return { original: originalUrl, converted: base64Url }
    })
  )

  // Replace URLs in template
  let processedTemplate = template
  for (const { original, converted } of conversions) {
    processedTemplate = processedTemplate.replace(
      new RegExp(`src="${original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
      `src="${converted}"`
    )
  }

  return processedTemplate
}

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

// Load font from various sources
async function loadFont(weight: 400 | 700 = 400): Promise<ArrayBuffer> {
  // Try multiple sources for reliability
  const sources = [
    // Source 1: jsDelivr CDN hosting fontsource
    weight === 400 
      ? 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf'
      : 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
    // Source 2: Google Fonts API with TTF user agent
    `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`,
  ]

  // Try jsDelivr first
  try {
    const response = await fetch(sources[0])
    if (response.ok) {
      const contentType = response.headers.get('content-type') || ''
      // Make sure we got a font file, not an error page
      if (contentType.includes('font') || contentType.includes('octet-stream')) {
        return response.arrayBuffer()
      }
    }
  } catch (e) {
    console.log('jsDelivr font failed, trying Google Fonts...')
  }

  // Fallback: Google Fonts with old user agent to get TTF
  try {
    const cssResponse = await fetch(sources[1], {
      headers: {
        // Very old user agent to force TTF
        'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)',
      },
    })
    const css = await cssResponse.text()
    
    // Extract URL - look for any url() in the CSS
    const urlMatch = css.match(/url\(([^)]+)\)/)
    if (urlMatch) {
      const fontUrl = urlMatch[1].replace(/['"]/g, '')
      const fontResponse = await fetch(fontUrl)
      if (fontResponse.ok) {
        return fontResponse.arrayBuffer()
      }
    }
  } catch (e) {
    console.log('Google Fonts TTF failed')
  }

  // Final fallback: Use Noto Sans from Google's static servers (always available)
  const notoUrl = weight === 700
    ? 'https://fonts.gstatic.com/s/notosans/v36/o-0NIpQlx3QUlC5A4PNjXhFVadyB1Wk.ttf'
    : 'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNb4j5Ba_2c7A.ttf'
  
  const notoResponse = await fetch(notoUrl)
  if (notoResponse.ok) {
    return notoResponse.arrayBuffer()
  }

  throw new Error(`Failed to load font weight ${weight} from all sources`)
}

// Parse HTML-like template string into Satori-compatible React element structure
function parseHtmlToSatoriElement(html: string): any {
  // Simple parser for HTML-like syntax to Satori element structure
  // This is a basic implementation - for production, consider using a proper HTML parser
  
  const result: any[] = []
  let current = html.trim()
  
  // Use regex to parse elements
  const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\s*\/>/g
  
  function parseElement(tagName: string, attributes: string, children: string): any {
    const element: any = {
      type: tagName,
      props: {
        style: {},
      },
    }
    
    // Parse style attribute
    const styleMatch = attributes.match(/style="([^"]*)"/)
    if (styleMatch) {
      const styleStr = styleMatch[1]
      const styleObj: Record<string, any> = {}
      
      // Parse CSS-like style string
      styleStr.split(';').forEach(rule => {
        const [prop, value] = rule.split(':').map(s => s.trim())
        if (prop && value) {
          // Convert kebab-case to camelCase
          const camelProp = prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
          styleObj[camelProp] = value
        }
      })
      
      element.props.style = styleObj
    }
    
    // Parse src attribute for img
    const srcMatch = attributes.match(/src="([^"]*)"/)
    if (srcMatch) {
      element.props.src = srcMatch[1]
    }
    
    // Parse width and height for img
    const widthMatch = attributes.match(/width="([^"]*)"/)
    if (widthMatch) {
      element.props.width = parseInt(widthMatch[1]) || widthMatch[1]
    }
    const heightMatch = attributes.match(/height="([^"]*)"/)
    if (heightMatch) {
      element.props.height = parseInt(heightMatch[1]) || heightMatch[1]
    }
    
    // Parse children
    if (children && children.trim()) {
      element.props.children = parseChildren(children)
    }
    
    return element
  }
  
  function parseChildren(content: string): any {
    const children: any[] = []
    let lastIndex = 0
    const regex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\s*\/>/g
    let match
    
    while ((match = regex.exec(content)) !== null) {
      // Add text before this element
      if (match.index > lastIndex) {
        const text = content.slice(lastIndex, match.index).trim()
        if (text) {
          children.push(text)
        }
      }
      
      if (match[1]) {
        // Opening and closing tag
        children.push(parseElement(match[1], match[2] || '', match[3] || ''))
      } else if (match[4]) {
        // Self-closing tag
        children.push(parseElement(match[4], match[5] || '', ''))
      }
      
      lastIndex = match.index + match[0].length
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      const text = content.slice(lastIndex).trim()
      if (text) {
        children.push(text)
      }
    }
    
    if (children.length === 0) {
      return content.trim() || undefined
    }
    if (children.length === 1) {
      return children[0]
    }
    return children
  }
  
  const parsed = parseChildren(current)
  return Array.isArray(parsed) ? parsed[0] : parsed
}

// Pre-load fonts for consistent rendering
let fontCache: { [key: number]: ArrayBuffer } = {}

async function getFont(weight: 400 | 700): Promise<ArrayBuffer> {
  if (fontCache[weight]) {
    return fontCache[weight]
  }
  
  try {
    fontCache[weight] = await loadFont(weight)
    return fontCache[weight]
  } catch (error) {
    console.error(`Failed to load font weight ${weight}:`, error)
    throw error
  }
}

export const Route = createFileRoute('/api/templates/preview')({
  server: {
    handlers: {
      // POST - Generate SVG preview using Satori
      POST: async ({ request }) => {
        const user = await getUserFromRequest(request)
        if (!user) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const body = await request.json()
          const { template, width, height, productData } = body

          if (!template) {
            return json({ error: 'Template content required' }, { status: 400 })
          }

          // Replace variables in template
          let processedTemplate = template
          if (productData) {
            Object.entries(productData).forEach(([key, value]) => {
              processedTemplate = processedTemplate.replace(
                new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
                String(value)
              )
            })
          }

          // Convert all image URLs to base64 JPEG using Sharp
          processedTemplate = await processTemplateImages(processedTemplate)

          // Parse HTML template to Satori element
          const element = parseHtmlToSatoriElement(processedTemplate)

          if (!element) {
            return json({ error: 'Failed to parse template' }, { status: 400 })
          }

          // Load fonts
          const [regularFont, boldFont] = await Promise.all([
            getFont(400),
            getFont(700),
          ])

          // Generate SVG using Satori
          const svg = await satori(element, {
            width: width || 1200,
            height: height || 630,
            fonts: [
              {
                name: 'Inter',
                data: regularFont,
                weight: 400,
                style: 'normal',
              },
              {
                name: 'Inter',
                data: boldFont,
                weight: 700,
                style: 'normal',
              },
            ],
          })

          return json({ svg })
        } catch (error: any) {
          console.error('Satori preview error:', error)
          return json({ error: error.message || 'Failed to generate preview' }, { status: 500 })
        }
      },
    },
  },
})
