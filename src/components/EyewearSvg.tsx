"use client";

import type { Variant } from "@/types/catalog";
import { PRODUCT_MEDIA } from "@/lib/product-media";

interface EyewearSvgProps {
  variant: Variant;
  className?: string;
  angle?: "front" | "angled";
}

/**
 * Foto real recortada do óculos (PNG com fundo transparente),
 * usada na vitrine e sobreposta ao rosto no provador.
 */
export function EyewearSvg({
  variant,
  className = "w-full h-auto",
  angle = "front",
}: EyewearSvgProps) {
  const media = PRODUCT_MEDIA[variant.productId] ?? PRODUCT_MEDIA["prod-imperial"];
  const src = angle === "angled" ? media.angle : media.front;

  return (
    <img
      src={src}
      alt={`${media.shortName} — ${variant.colorName}`}
      className={`select-none object-contain ${className}`}
      draggable={false}
    />
  );
}
