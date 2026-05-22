import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/config";

function withCors(response, origin) {
  const headers = corsHeaders(origin);
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}

export async function OPTIONS(request) {
  return withCors(new NextResponse(null, { status: 204 }), request.headers.get("origin") || "");
}

export async function POST(request) {
  return withCors(
    NextResponse.json(
      {
        ok: false,
        error: "Enrichment is not implemented yet.",
        plannedFeatures: ["audio-transcript", "ocr", "scene-tags", "embeddings"],
        schemaHint: "Once implemented, results will be merged into each post's `enrichments` field."
      },
      { status: 501 }
    ),
    request.headers.get("origin") || ""
  );
}
