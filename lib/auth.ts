import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

/** Passwordless session: a signed HS256 JWT in an httpOnly cookie.
 *  Users sign in by email OTP; "Try Demo" gets an anonymous session. */
const SECRET = new TextEncoder().encode(process.env.PP_JWT_SECRET ?? 'dev-only-insecure-secret');
const COOKIE = 'pp_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface Session {
  /** email for real users, a random id for anonymous demo sessions */
  sub: string;
  anon: boolean;
}

export async function createSessionCookie(sub: string, anon: boolean): Promise<void> {
  const token = await new SignJWT({ anon })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { sub: String(payload.sub), anon: Boolean(payload.anon) };
  } catch {
    return null;
  }
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.PP_SUPER_ADMIN ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Partition key for a session's data: u#<email> for users, a#<id> for anon. */
export function ownerId(s: Session): string {
  return s.anon ? `a#${s.sub}` : `u#${s.sub}`;
}

