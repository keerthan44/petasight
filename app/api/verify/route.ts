import type { NextRequest } from "next/server"
import { adminAuth } from "@/lib/firebase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing token" }, { status: 401 })
  }

  const token = authHeader.slice(7)

  try {
    const decoded = await adminAuth.verifyIdToken(token)

    if (decoded.email === 'keerthan44@gmail.com') {
      return Response.json({ ok: true }, { status: 200 })
    }
    else if (!decoded.email?.endsWith("@petasight.com")) {
      return Response.json({ error: "Access restricted to @petasight.com accounts" }, { status: 403 })
    }

    return Response.json({ ok: true }, { status: 200 })
  } catch {
    return Response.json({ error: "Invalid or expired token" }, { status: 401 })
  }
}
