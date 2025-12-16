// ============================================================================
// Scaleway Object Storage Service (S3 Compatible) + Local Fallback
// ============================================================================

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Scaleway Object Storage configuration
const S3_REGION = process.env.S3_REGION || 'fr-par'
const S3_ENDPOINT = process.env.S3_ENDPOINT || `https://s3.${S3_REGION}.scw.cloud`
const S3_BUCKET = process.env.S3_BUCKET || 'jastreb-media'
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || ''
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || ''

// Local storage configuration
const LOCAL_UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads'

// Initialize S3 client for Scaleway
const s3Client = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: false, // Scaleway uses virtual-hosted style
})

// Get public URL for an object
export function getPublicUrl(key: string): string {
  return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`
}

// Generate a unique key for storing media
export function generateMediaKey(userId: number, productId: number, type: 'image' | 'video', filename: string): string {
  const timestamp = Date.now()
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `users/${userId}/products/${productId}/${type}s/${timestamp}-${sanitizedFilename}`
}

// Upload a file to S3
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ url: string; key: string }> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ACL: 'public-read',
    Metadata: metadata,
  })

  await s3Client.send(command)

  return {
    url: getPublicUrl(key),
    key,
  }
}

// Upload base64 encoded image
export async function uploadBase64Image(
  base64Data: string,
  userId: number,
  productId: number,
  filename: string = 'generated.png'
): Promise<{ url: string; key: string }> {
  // Remove data URL prefix if present
  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Content, 'base64')
  
  // Determine content type from base64 prefix or filename
  let contentType = 'image/png'
  if (base64Data.startsWith('data:image/jpeg')) {
    contentType = 'image/jpeg'
  } else if (base64Data.startsWith('data:image/webp')) {
    contentType = 'image/webp'
  } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
    contentType = 'image/jpeg'
  } else if (filename.endsWith('.webp')) {
    contentType = 'image/webp'
  }

  const key = generateMediaKey(userId, productId, 'image', filename)
  return uploadFile(key, buffer, contentType)
}

// Upload video file
export async function uploadVideo(
  data: Buffer | Uint8Array,
  userId: number,
  productId: number,
  filename: string,
  contentType: string = 'video/mp4'
): Promise<{ url: string; key: string }> {
  const key = generateMediaKey(userId, productId, 'video', filename)
  return uploadFile(key, data, contentType)
}

// Delete a file from S3
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  })

  await s3Client.send(command)
}

// Generate a presigned URL for uploading
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ACL: 'public-read',
  })

  return getSignedUrl(s3Client, command, { expiresIn })
}

// Generate a presigned URL for downloading
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  })

  return getSignedUrl(s3Client, command, { expiresIn })
}

// List files in a directory
export async function listFiles(prefix: string): Promise<{ key: string; url: string; size: number; lastModified: Date }[]> {
  const command = new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: prefix,
  })

  const response = await s3Client.send(command)
  
  return (response.Contents || []).map((item) => ({
    key: item.Key || '',
    url: getPublicUrl(item.Key || ''),
    size: item.Size || 0,
    lastModified: item.LastModified || new Date(),
  }))
}

// Check if S3 is configured
export function isS3Configured(): boolean {
  return !!(S3_ACCESS_KEY && S3_SECRET_KEY && S3_BUCKET)
}

// ============================================================================
// Local Storage Fallback (for development without S3)
// ============================================================================

function ensureLocalDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function getLocalPublicUrl(relativePath: string): string {
  return `/uploads/${relativePath}`
}

// Save file locally
export async function saveLocalFile(
  data: Buffer | Uint8Array,
  userId: number,
  productId: number,
  type: 'image' | 'video',
  filename: string
): Promise<{ url: string; key: string }> {
  const timestamp = Date.now()
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  const relativePath = `products/${productId}/${type}s/${timestamp}-${sanitizedFilename}`
  const fullDir = path.join(LOCAL_UPLOAD_DIR, `products/${productId}/${type}s`)
  const fullPath = path.join(LOCAL_UPLOAD_DIR, relativePath)
  
  ensureLocalDir(fullDir)
  fs.writeFileSync(fullPath, data)
  
  return {
    url: getLocalPublicUrl(relativePath),
    key: relativePath,
  }
}

// Save base64 image locally
export async function saveLocalBase64Image(
  base64Data: string,
  userId: number,
  productId: number,
  filename: string = 'generated.png'
): Promise<{ url: string; key: string }> {
  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Content, 'base64')
  return saveLocalFile(buffer, userId, productId, 'image', filename)
}

// Delete local file
export async function deleteLocalFile(key: string): Promise<void> {
  const fullPath = path.join(LOCAL_UPLOAD_DIR, key)
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath)
  }
}

// ============================================================================
// Smart Upload Functions (S3 with local fallback)
// ============================================================================

export async function smartUploadBase64Image(
  base64Data: string,
  userId: number,
  productId: number,
  filename: string = 'generated.png'
): Promise<{ url: string; key: string }> {
  if (isS3Configured()) {
    return uploadBase64Image(base64Data, userId, productId, filename)
  }
  return saveLocalBase64Image(base64Data, userId, productId, filename)
}

// Upload base64 image for chat (no productId required)
export async function uploadChatImage(
  base64Data: string,
  userId: number,
  filename: string = 'chat-generated.png'
): Promise<{ url: string; key: string }> {
  // Remove data URL prefix if present
  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Content, 'base64')
  
  // Determine content type
  let contentType = 'image/png'
  if (base64Data.startsWith('data:image/jpeg')) {
    contentType = 'image/jpeg'
  } else if (base64Data.startsWith('data:image/webp')) {
    contentType = 'image/webp'
  } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
    contentType = 'image/jpeg'
  } else if (filename.endsWith('.webp')) {
    contentType = 'image/webp'
  }

  const timestamp = Date.now()
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  const key = `users/${userId}/chat/${timestamp}-${sanitizedFilename}`

  if (isS3Configured()) {
    return uploadFile(key, buffer, contentType)
  } else {
    // Local storage
    const relativePath = `users/${userId}/chat/${timestamp}-${sanitizedFilename}`
    const fullDir = path.join(LOCAL_UPLOAD_DIR, `users/${userId}/chat`)
    const fullPath = path.join(LOCAL_UPLOAD_DIR, relativePath)
    
    ensureLocalDir(fullDir)
    fs.writeFileSync(fullPath, buffer)
    
    return {
      url: getLocalPublicUrl(relativePath),
      key: relativePath,
    }
  }
}

export async function smartDeleteFile(key: string): Promise<void> {
  if (isS3Configured()) {
    return deleteFile(key)
  }
  return deleteLocalFile(key)
}

