import { getAppOrigin, getArchiveEndpoint } from "@/lib/config";
import { getBookmarkletSource } from "@/lib/bookmarklet-source";

export async function GET() {
  const source = getBookmarkletSource({
    apiUrl: getArchiveEndpoint(),
    appUrl: getAppOrigin()
  });
  return new Response(source, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
