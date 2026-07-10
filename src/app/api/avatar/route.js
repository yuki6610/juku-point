import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

export async function GET(request) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "missing-url" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid-url" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: "unsupported-avatar-host" }, { status: 400 });
  }

  const response = await fetch(parsed.toString(), { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: "avatar-fetch-failed" },
      { status: response.status }
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", response.headers.get("content-type") || "model/gltf-binary");
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Access-Control-Allow-Origin", "*");

  return new NextResponse(response.body, { headers });
}
