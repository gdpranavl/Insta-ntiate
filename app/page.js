import { Dashboard } from "@/components/dashboard";
import { readArchive } from "@/lib/archive-store";
import { getAppOrigin, getArchiveEndpoint } from "@/lib/config";
import { getBookmarkletHref } from "@/lib/bookmarklet-source";

export default async function HomePage() {
  const archive = await readArchive();
  const appOrigin = getAppOrigin();
  const bookmarkletHref = getBookmarkletHref({
    apiUrl: getArchiveEndpoint(),
    appUrl: appOrigin
  });
  return (
    <Dashboard
      initialArchive={archive}
      appOrigin={appOrigin}
      bookmarkletHref={bookmarkletHref}
    />
  );
}
