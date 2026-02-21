import * as bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export async function generateToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

export async function createSession(userId: string) {
  const token = await generateToken(userId);

  const cookieStore = await cookies();
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return token;
}

export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });
    return payload as { userId: string };
  } catch (error) {
    return null;
  }
}

export async function getSession(req?: NextRequest) {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get('auth-token')?.value;
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get('auth-token')?.value;
  }

  if (!token) return null;
  return verifySession(token);
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('auth-token');
}
