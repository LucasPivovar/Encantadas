import { getCatalogData, getTryOnManifest } from "@/lib/catalog";
import { EncantadasExperience } from "@/components/EncantadasExperience";

export default function HomePage() {
  const catalog = getCatalogData();
  const manifest = getTryOnManifest();

  return <EncantadasExperience catalog={catalog} manifest={manifest} />;
}
