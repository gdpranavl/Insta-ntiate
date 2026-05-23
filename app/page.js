import { Dashboard } from "@/components/dashboard";
import { readArchive } from "@/lib/archive-store";
import { getAppOrigin } from "@/lib/config";

export default async function HomePage() {
  const archive = await readArchive();
  const appOrigin = getAppOrigin();
  return (
    <Dashboard
      initialArchive={archive}
      appOrigin={appOrigin}
    />
  );
}
