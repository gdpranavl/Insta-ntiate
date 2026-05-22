import { Dashboard } from "@/components/dashboard";
import { readArchive } from "@/lib/archive-store";

export default async function HomePage() {
  const archive = await readArchive();
  return <Dashboard initialArchive={archive} />;
}
