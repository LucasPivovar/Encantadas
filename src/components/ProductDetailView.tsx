"use client";

import { useMemo, useState } from "react";
import type { CatalogData, Product, TryOnManifest } from "@/types/catalog";
import { isTryOnApproved } from "@/lib/catalog";
import { getProductMedia } from "@/lib/product-media";
import { trackEvent } from "@/lib/telemetry";
import { EyewearSvg } from "./EyewearSvg";
import { SiteHeader } from "./SiteHeader";
import { TryOnModal } from "./TryOnModal";

interface ProductDetailViewProps {
  product: Product;
  catalog: CatalogData;
  manifest: TryOnManifest;
}

export function ProductDetailView({ product, catalog, manifest }: ProductDetailViewProps) {
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const [angle, setAngle] = useState<"front" | "angled">("front");
  const [isTryOnOpen, setIsTryOnOpen] = useState(false);

  const variant = useMemo(
    () => product.variants.find((v) => v.id === variantId) ?? product.variants[0],
    [product, variantId]
  );
  const media = getProductMedia(product.id);
  const canTry = isTryOnApproved(variant.id, manifest);

  return (
    <div className="min-h-svh bg-white text-[#1d1d1f]">
      <SiteHeader backHref="/" onTry={() => setIsTryOnOpen(true)} />

      <main className="mx-auto max-w-[1100px] px-6 pb-32 pt-[52px]">
        <div className="grid grid-cols-1 items-center gap-12 py-16 md:grid-cols-12 md:gap-16 md:py-24">
          {/* Imagem */}
          <div className="md:col-span-7">
            <div className="flex aspect-[16/10] items-center justify-center bg-[#f5f5f7] px-8 md:rounded-[18px]">
              <EyewearSvg variant={variant} angle={angle} className="max-h-[78%] max-w-[88%]" />
            </div>
            <div className="mt-4 flex justify-center gap-2" role="tablist" aria-label="Ângulo">
              {(
                [
                  { id: "front", label: "Frente" },
                  { id: "angled", label: "Ângulo" },
                ] as const
              ).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={angle === a.id}
                  onClick={() => setAngle(a.id)}
                  className={`min-h-9 rounded-full px-4 text-[14px] transition-colors ${
                    angle === a.id ? "bg-[#1d1d1f] text-white" : "text-[#6e6e73] hover:text-[#1d1d1f]"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Informações */}
          <div className="md:col-span-5">
            <h1 className="t-headline">{media.shortName}</h1>
            <p className="t-intro mt-3 text-[#6e6e73]">{product.description}</p>

            {product.variants.length > 1 && (
              <div className="mt-8">
                <p className="text-[14px] font-semibold">Cor · {variant.colorName}</p>
                <div className="mt-3 flex gap-3">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVariantId(v.id);
                        trackEvent("variant_selected", { variantId: v.id, sku: v.sku, source: "product_page" });
                      }}
                      aria-label={v.colorName}
                      aria-pressed={v.id === variant.id}
                      className={`h-9 w-9 rounded-full transition-shadow ${
                        v.id === variant.id ? "ring-2 ring-[#0071e3] ring-offset-2" : "ring-1 ring-black/10"
                      }`}
                      style={{ backgroundColor: v.colorHex }}
                    />
                  ))}
                </div>
              </div>
            )}

            <dl className="mt-10 grid grid-cols-3 border-t border-[#d2d2d7] pt-6 text-center tabular-nums">
              {[
                { k: "Lente", v: product.dimensionsMm.lensWidth },
                { k: "Ponte", v: product.dimensionsMm.bridge },
                { k: "Haste", v: product.dimensionsMm.templeLength },
              ].map((m) => (
                <div key={m.k}>
                  <dt className="text-[12px] text-[#6e6e73]">{m.k}</dt>
                  <dd className="mt-1 text-[17px] font-semibold">{m.v} mm</dd>
                </div>
              ))}
            </dl>

            <div className="mt-10 flex flex-wrap gap-3">
              {canTry && (
                <button type="button" onClick={() => setIsTryOnOpen(true)} className="btn btn-secondary">
                  Prove agora
                </button>
              )}
              <a
                href={variant.purchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("purchase_click", { variantId: variant.id, sku: variant.sku, source: "product_page" })}
                className="btn btn-primary"
              >
                Comprar
              </a>
            </div>
          </div>
        </div>

        {media.annaPhoto && (
          <figure className="mx-auto max-w-[520px]">
            <img
              src={media.annaPhoto}
              alt={`Anna usando o ${media.shortName}`}
              className="aspect-[4/5] w-full rounded-[18px] object-cover object-[50%_30%]"
              loading="lazy"
            />
            <figcaption className="mt-3 text-center text-[14px] text-[#6e6e73]">Na Anna.</figcaption>
          </figure>
        )}
      </main>

      <TryOnModal
        isOpen={isTryOnOpen}
        initialVariantId={variant.id}
        catalog={catalog}
        manifest={manifest}
        onClose={() => setIsTryOnOpen(false)}
        onSelectVariant={(id) => {
          if (product.variants.some((v) => v.id === id)) setVariantId(id);
        }}
      />
    </div>
  );
}
