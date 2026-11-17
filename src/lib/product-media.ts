/**
 * Mídia real de cada óculos (fotos de estúdio e fotos da Anna).
 * Tudo vem das fotos e vídeos originais da marca — nada desenhado ou gerado.
 */
export interface ProductMedia {
  shortName: string;
  tagline: string;
  front: string;
  angle: string;
  annaPhoto?: string;
}

export const PRODUCT_MEDIA: Record<string, ProductMedia> = {
  "prod-pantera": {
    shortName: "Pantera",
    tagline: "Sem aro · Pantera em ouro 18K",
    front: "/images/products/pantera-front.png",
    angle: "/images/products/pantera-angle.png",
    annaPhoto: "/images/anna/anna-05-pantera-frente.jpg",
  },
  "prod-imperial": {
    shortName: "Imperial",
    tagline: "Tartaruga · Leão em ouro 18K",
    front: "/images/products/imperial-front.png",
    angle: "/images/products/imperial-side.png",
  },
  "prod-navigator": {
    shortName: "Solaris",
    tagline: "Acetato preto · Lente âmbar",
    front: "/images/ar/ar-02-navigator-ambar.png",
    angle: "/images/ar/ar-angle-02-navigator-ambar.png",
    annaPhoto: "/images/anna/anna-07-ambar-frente.jpg",
  },
  "prod-bold": {
    shortName: "Aurea",
    tagline: "Tartaruga clássico · Lente café",
    front: "/images/ar/ar-04-bold-tartaruga.png",
    angle: "/images/ar/ar-angle-04-bold-tartaruga.png",
    annaPhoto: "/images/anna/anna-08-bold-maos.jpg",
  },
};

export function getProductMedia(productId: string): ProductMedia {
  return PRODUCT_MEDIA[productId] ?? PRODUCT_MEDIA["prod-imperial"];
}
