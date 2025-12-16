import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/db'
import { users, sessions, type User } from '@/db/schema'
import { eq } from 'drizzle-orm'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

// ============================================================================
// Password Hashing
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ============================================================================
// JWT Token Management
// ============================================================================

export async function createToken(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return { userId: payload.userId as number }
  } catch {
    return null
  }
}

// ============================================================================
// Session Management
// ============================================================================

export function generateSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createSession(userId: number): Promise<string> {
  const sessionId = generateSessionId()
  const expiresAt = new Date(Date.now() + SESSION_DURATION)

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  })

  return sessionId
}

export async function validateSession(sessionId: string): Promise<User | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1)

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await db.delete(sessions).where(eq(sessions.id, sessionId))
    }
    return null
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)

  return user || null
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

// ============================================================================
// User Management
// ============================================================================

export async function createUser(
  email: string,
  password: string,
  name?: string,
  isAdmin: boolean = false
): Promise<User> {
  const passwordHash = await hashPassword(password)

  const [user] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      isAdmin,
    })
    .returning()

  return user
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  return user || null
}

export async function getUserById(id: number): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  return user || null
}

export async function hasAnyUsers(): Promise<boolean> {
  const result = await db.select({ count: users.id }).from(users).limit(1)
  return result.length > 0
}

export async function getUserCount(): Promise<number> {
  const result = await db.select().from(users)
  return result.length
}

// ============================================================================
// Authentication Functions
// ============================================================================

export async function login(
  email: string,
  password: string
): Promise<{ user: User; sessionId: string } | { error: string }> {
  const user = await getUserByEmail(email)

  if (!user) {
    return { error: 'Invalid email or password' }
  }

  const isValid = await verifyPassword(password, user.passwordHash)

  if (!isValid) {
    return { error: 'Invalid email or password' }
  }

  const sessionId = await createSession(user.id)

  return { user, sessionId }
}

export async function register(
  email: string,
  password: string,
  name?: string,
  isAdmin: boolean = false // Only set to true when admin creates user
): Promise<{ user: User; sessionId: string } | { error: string }> {
  const existing = await getUserByEmail(email)

  if (existing) {
    return { error: 'Email already registered' }
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' }
  }

  // Check if this is the first user (auto-set as admin)
  const userCount = await getUserCount()
  const shouldBeAdmin = userCount === 0 || isAdmin

  const passwordHash = await hashPassword(password)

  const [user] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      isAdmin: shouldBeAdmin,
    })
    .returning()

  const sessionId = await createSession(user.id)

  return { user, sessionId }
}

// ============================================================================
// Cookie Helpers
// ============================================================================

export const SESSION_COOKIE_NAME = 'jastreb_session'

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION / 1000,
    path: '/',
  }
}

