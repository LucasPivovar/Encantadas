import catalogJson from "../../public/catalog.json";
import manifestJson from "../../public/try-on/manifest.json";
import type { CatalogData, Product, TryOnAsset, TryOnManifest, Variant } from "@/types/catalog";

export function getCatalogData(): CatalogData {
  return catalogJson as CatalogData;
}

export function getTryOnManifest(): TryOnManifest {
  return manifestJson as TryOnManifest;
}

export function getTryOnAssetForVariant(
  variantId: string,
  manifest: TryOnManifest
): TryOnAsset | undefined {
  if (!manifest.config.enabled) return undefined;
  return manifest.assets.find((asset) => asset.variantId === variantId);
}

export function isTryOnApproved(variantId: string, manifest: TryOnManifest): boolean {
  if (!manifest.config.enabled) return false;
  const asset = getTryOnAssetForVariant(variantId, manifest);
  return asset?.status === "approved";
}

export function getProductBySlug(slug: string, catalog: CatalogData): Product | undefined {
  return catalog.products.find((p) => p.slug === slug);
}

export function getVariantById(
  variantId: string,
  catalog: CatalogData
): { product: Product; variant: Variant } | undefined {
  for (const product of catalog.products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return undefined;
}
