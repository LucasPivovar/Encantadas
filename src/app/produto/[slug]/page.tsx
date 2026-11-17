import { notFound } from "next/navigation";
import {
  getCatalogData,
  getProductBySlug,
  getTryOnManifest,
} from "@/lib/catalog";
import { ProductDetailView } from "@/components/ProductDetailView";

export function generateStaticParams() {
  const catalog = getCatalogData();
  return catalog.products.map((product) => ({
    slug: product.slug,
  }));
}

export default async function ProductPage({
  params,
}: PageProps<"/produto/[slug]">) {
  const { slug } = await params;
  const catalog = getCatalogData();
  const manifest = getTryOnManifest();
  const product = getProductBySlug(slug, catalog);

  if (!product) {
    notFound();
  }

  return (
    <ProductDetailView
      product={product}
      catalog={catalog}
      manifest={manifest}
    />
  );
}
