"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { CatalogData, Product, TryOnManifest } from "@/types/catalog";
import { isTryOnApproved } from "@/lib/catalog";
import { getProductMedia } from "@/lib/product-media";
import { trackEvent } from "@/lib/telemetry";
import { SiteHeader } from "./SiteHeader";
import { ScrollSequence } from "./ScrollSequence";
import { TryOnModal } from "./TryOnModal";

interface EncantadasExperienceProps {
  catalog: CatalogData;
  manifest: TryOnManifest;
}

const MANIFESTO =
  "Feitos para transformar o seu rosto no primeiro segundo. Ouro 18K esculpido, acetato italiano e lentes que iluminam o olhar.";

/**
 * Todas as 8 fotografias individuais recortadas da Anna para o Carrossel Infinito
 */
const ANNA_CAROUSEL_SLIDES = [
  {
    src: "/images/anna/anna-02-pantera-pose.jpg",
    productId: "prod-pantera",
    caption: "Pantera · Degradê Chá",
    position: "50% 25%",
  },
  {
    src: "/images/anna/anna-07-ambar-frente.jpg",
    productId: "prod-navigator",
    caption: "Solaris · Lente Âmbar",
    position: "50% 28%",
  },
  {
    src: "/images/anna/anna-08-bold-maos.jpg",
    productId: "prod-bold",
    caption: "Aurea · Tartaruga Clássico",
    position: "50% 30%",
  },
  {
    src: "/images/anna/anna-03-pantera-perfil.jpg",
    productId: "prod-pantera",
    caption: "Pantera · Perfil em Ouro 18K",
    position: "50% 30%",
  },
  {
    src: "/images/anna/anna-06-ambar-low.jpg",
    productId: "prod-navigator",
    caption: "Solaris · Acetato Preto",
    position: "50% 25%",
  },
  {
    src: "/images/anna/anna-09-bold-pose.jpg",
    productId: "prod-bold",
    caption: "Aurea · Lente Café",
    position: "50% 28%",
  },
  {
    src: "/images/anna/anna-04-pantera-close.jpg",
    productId: "prod-pantera",
    caption: "Pantera · Detalhe Esculpido",
    position: "50% 38%",
  },
  {
    src: "/images/anna/anna-05-pantera-frente.jpg",
    productId: "prod-pantera",
    caption: "Pantera · Leveza Sem Aro",
    position: "50% 28%",
  },
];

export function EncantadasExperience({ catalog, manifest }: EncantadasExperienceProps) {
  const [isTryOnOpen, setIsTryOnOpen] = useState(false);
  const [tryVariantId, setTryVariantId] = useState(catalog.products[0].variants[0].id);

  const rootRef = useRef<HTMLDivElement | null>(null);

  const productById = useMemo(() => {
    const map: Record<string, Product> = {};
    catalog.products.forEach((p) => (map[p.id] = p));
    return map;
  }, [catalog.products]);

  const imperial = productById["prod-imperial"] ?? catalog.products[0];
  const pantera = productById["prod-pantera"] ?? catalog.products[0];

  const firstApprovedVariantId = useMemo(() => {
    for (const p of catalog.products) {
      for (const v of p.variants) {
        if (isTryOnApproved(v.id, manifest)) return v.id;
      }
    }
    return catalog.products[0].variants[0].id;
  }, [catalog.products, manifest]);

  const openTry = (variantId: string) => {
    setTryVariantId(variantId);
    setIsTryOnOpen(true);
  };

  const smoothJump = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
  };

  const trackPurchase = (variantId: string, sku: string, source: string) =>
    trackEvent("purchase_click", { variantId, sku, source });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });

    const ctx = gsap.context(() => {
      // 0. Entrada elegante do texto do Hero
      gsap.fromTo(
        "[data-hero-copy] > *",
        { autoAlpha: 0, y: 24 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1.0,
          stagger: 0.1,
          ease: "expo.out",
          delay: 0.08,
        }
      );

      // 1. Hero recua com interpolação leve enquanto a primeira seção sobe
      gsap.to("[data-hero-photo]", {
        scale: 0.95,
        ease: "none",
        scrollTrigger: { trigger: "[data-after-hero]", start: "top bottom", end: "top top", scrub: true },
      });
      gsap.to("[data-hero-copy]", {
        y: -40,
        autoAlpha: 0,
        ease: "none",
        scrollTrigger: { trigger: "[data-after-hero]", start: "top bottom", end: "top 45%", scrub: true },
      });
      gsap.to("[data-hero-shade]", {
        opacity: 0.22,
        ease: "none",
        scrollTrigger: { trigger: "[data-after-hero]", start: "top bottom", end: "top top", scrub: true },
      });

      // 2. Manifesto: cada palavra acende conforme a rolagem
      gsap.fromTo(
        "[data-word]",
        { opacity: 0.15 },
        {
          opacity: 1,
          stagger: 0.08,
          ease: "none",
          scrollTrigger: { trigger: "[data-manifesto]", start: "top 82%", end: "bottom 52%", scrub: true },
        }
      );

      // 3. Entradas suaves sem bloquear scroll
      ScrollTrigger.batch("[data-reveal]", {
        start: "top 88%",
        onEnter: (els) =>
          gsap.fromTo(
            els,
            { autoAlpha: 0, y: 28 },
            { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.06, ease: "expo.out", overwrite: true }
          ),
      });
    }, root);

    return () => ctx.revert();
  }, []);

  // Duplica a lista para criar o loop infinito perfeito (-50% translate3d)
  const infiniteSlides = useMemo(
    () => [...ANNA_CAROUSEL_SLIDES, ...ANNA_CAROUSEL_SLIDES],
    []
  );

  return (
    <div ref={rootRef} id="topo" className="bg-white text-[#1d1d1f]">
      <SiteHeader onTry={() => openTry(firstApprovedVariantId)} />

      <main className="w-full max-w-full overflow-x-clip">
        {/* ============================================================
            HERO — Fotografia 16:9 da Anna + Copy de Lançamento & Venda
           ============================================================ */}
        <section className="sticky top-0 z-0 h-svh w-full overflow-hidden bg-[#bfb6ae]" aria-label="Anna — Coleção Encantadas">
          <div data-hero-photo className="h-full w-full will-change-transform">
            <picture>
              <source media="(min-width: 768px)" srcSet="/images/anna/anna-hero-wide.jpg" />
              <img
                src="/images/ar/anna-hero-clean.jpg"
                alt="Anna usando o óculos Pantera da coleção Encantadas"
                className="h-full w-full object-cover object-[50%_22%] md:object-[58%_30%]"
                fetchPriority="high"
              />
            </picture>
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#b5aba2] via-[#b5aba2]/75 to-transparent md:hidden"
            aria-hidden="true"
          />

          <div className="pointer-events-none absolute inset-0 flex items-end md:items-center">
            <div className="mx-auto w-full max-w-[1280px] px-5 pb-8 sm:px-6 sm:pb-12 md:px-10 md:pb-0">
              <div data-hero-copy className="pointer-events-auto max-w-[440px]">
                <p className="text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.22em] sm:tracking-[0.26em] text-[#1d1d1f]/80">
                  Lançamento Exclusivo · Por Anna
                </p>

                <h1 className="mt-2 sm:mt-3 text-[clamp(34px,8.5vw,68px)] font-semibold leading-[1.03] tracking-[-0.024em] text-[#1d1d1f]">
                  Coleção Encantadas.
                </h1>

                <p className="mt-3 sm:mt-4 max-w-[340px] text-[15px] sm:text-[16px] leading-[1.46] text-[#1d1d1f]/85">
                  Joalheria óptica em ouro 18K e acetato italiano. Prove agora
                  no seu rosto e escolha o seu.
                </p>

                <div className="mt-6 sm:mt-8 flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <a
                    href="#primeira-cena"
                    onClick={(e) => smoothJump(e, "primeira-cena")}
                    className="btn btn-primary flex-1 sm:flex-initial"
                  >
                    Conhecer a coleção
                  </a>

                  <a
                    href="#colecao"
                    onClick={(e) => smoothJump(e, "colecao")}
                    className="btn bg-white/85 text-[#1d1d1f] backdrop-blur-md hover:bg-white flex-1 sm:flex-initial"
                  >
                    Comprar agora
                  </a>
                </div>
              </div>
            </div>
          </div>

          <a
            href="#primeira-cena"
            onClick={(e) => smoothJump(e, "primeira-cena")}
            aria-label="Rolar para conhecer a coleção"
            className="hidden md:flex absolute bottom-7 left-1/2 -translate-x-1/2 flex-col items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-[#1d1d1f]/65 hover:text-[#1d1d1f] transition-colors"
          >
            <span>Descubra</span>
            <span className="block h-7 w-[1px] bg-[#1d1d1f]/40" />
          </a>

          <div data-hero-shade className="pointer-events-none absolute inset-0 bg-black opacity-0" aria-hidden="true" />
        </section>

        {/* Tudo depois do hero sobe por cima dele em Fundo Branco Puro (#FFFFFF) */}
        <div id="primeira-cena" data-after-hero className="relative z-10 bg-white">
          {/* ============================================================
              VÍDEO 1 — Imperial (Fundo #FFFFFF puro, zero borrão lateral)
             ============================================================ */}
          <ScrollSequence
            folder="/sequences/imperial"
            frameCount={120}
            backdrop="#ffffff"
            intro="Imperial."
            feature={{
              title: "Presença que impõe respeito.",
              text: "O leão esculpido em ouro 18K encontra a ponte dupla polida e lentes em degradê marrom.",
            }}
            finale={{
              name: "Imperial · Ouro 18K & Tartaruga",
              subtitle: "Edição limitada de lançamento",
              onTry: () => openTry(imperial.variants[0].id),
              purchaseUrl: imperial.variants[0].purchaseUrl,
              onPurchase: () => trackPurchase(imperial.variants[0].id, imperial.variants[0].sku, "sequence_imperial"),
            }}
          />

          {/* ============================================================
              MANIFESTO DE DESEJO
             ============================================================ */}
          <section className="bg-white px-6 py-24 md:py-36">
            <p data-manifesto className="t-headline mx-auto max-w-[920px] text-center text-[#1d1d1f]">
              {MANIFESTO.split(" ").map((word, i) => (
                <span key={`${word}-${i}`} data-word className="inline-block">
                  {word}
                  {"\u00a0"}
                </span>
              ))}
            </p>
          </section>

          {/* ============================================================
              A COLEÇÃO — Escolha & Compra Direta
             ============================================================ */}
          <section id="colecao" className="scroll-mt-20 bg-white pb-28 md:pb-36">
            <div className="mx-auto max-w-[980px] px-6 text-center">
              <h2 data-reveal className="t-headline text-[#1d1d1f]">
                Escolha o seu olhar.
              </h2>
              <p data-reveal className="mt-3 text-[17px] text-[#6e6e73]">
                Experimente no seu rosto pela câmera antes de finalizar o pedido.
              </p>
            </div>

            <ul className="mx-auto mt-12 grid max-w-[1160px] grid-cols-1 gap-12 px-5 sm:mt-14 sm:grid-cols-2 sm:gap-8 sm:px-6 lg:mt-16 lg:grid-cols-4">
              {catalog.products.map((prod) => {
                const media = getProductMedia(prod.id);
                const variant = prod.variants[0];
                return (
                  <li
                    key={prod.id}
                    data-reveal
                    className="group flex flex-col items-center text-center"
                  >
                    <a
                      href={`/produto/${prod.slug}`}
                      className="flex h-36 sm:h-40 w-full items-center justify-center overflow-hidden"
                      aria-label={`Ver ${media.shortName}`}
                    >
                      <img
                        src={media.front}
                        alt={`${media.shortName} — vista frontal`}
                        className="h-auto max-h-full w-[78%] sm:w-[86%] object-contain transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                        loading="lazy"
                      />
                    </a>

                    <h3 className="mt-5 sm:mt-7 text-[22px] sm:text-[24px] font-semibold leading-tight tracking-[0.009em]">
                      {media.shortName}
                    </h3>
                    <p className="mt-1.5 text-[14px] text-[#6e6e73]">{media.tagline}</p>

                    <div className="mt-5 sm:mt-6 flex items-center justify-center gap-2.5">
                      <button type="button" onClick={() => openTry(variant.id)} className="btn btn-secondary btn-sm min-w-[104px]">
                        Provar
                      </button>
                      <a
                        href={variant.purchaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackPurchase(variant.id, variant.sku, "collection")}
                        className="btn btn-primary btn-sm min-w-[104px]"
                      >
                        Comprar
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ============================================================
              CARROSSEL INFINITO CONTÍNUO COM TODAS AS FOTOS DA ANNA
             ============================================================ */}
          <section className="bg-[#f5f5f7] py-24 md:py-32 overflow-hidden">
            <div className="mx-auto max-w-[1160px] px-6 text-center">
              <h2 data-reveal className="t-headline text-[#1d1d1f]">
                Como fica no rosto.
              </h2>
              <p data-reveal className="mt-2.5 text-[17px] text-[#6e6e73]">
                Veja a proporção real de cada peça na Anna e clique para provar em você.
              </p>
            </div>

            {/* Faixa em Loop Infinito Contínuo (Pausa ao passar o mouse) */}
            <div className="mt-14 w-full overflow-hidden">
              <div className="animate-infinite-carousel gap-5 pl-5">
                {infiniteSlides.map((slide, i) => {
                  const prod = productById[slide.productId];
                  return (
                    <figure
                      key={`${slide.src}-${i}`}
                      className="group relative h-[440px] w-[300px] sm:h-[500px] sm:w-[350px] shrink-0 overflow-hidden rounded-[22px] bg-[#e2ddd7]"
                    >
                      <img
                        src={slide.src}
                        alt={`Anna — ${slide.caption}`}
                        className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                        style={{ objectPosition: slide.position }}
                        loading="eager"
                      />
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
                        aria-hidden="true"
                      />
                      <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-5">
                        <span className="text-[15px] font-medium text-white">
                          {slide.caption}
                        </span>
                        {prod && (
                          <button
                            type="button"
                            onClick={() => openTry(prod.variants[0].id)}
                            className="btn btn-sm bg-white/95 text-[#1d1d1f] backdrop-blur-md hover:bg-white"
                          >
                            Provar este
                          </button>
                        )}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ============================================================
              VÍDEO 2 — Pantera (Fundo #FFFFFF puro, zero borrão lateral)
             ============================================================ */}
          <ScrollSequence
            folder="/sequences/pantera"
            frameCount={120}
            backdrop="#ffffff"
            intro="Pantera."
            feature={{
              title: "Leve como se não estivesse ali.",
              text: "Lentes sem aro lapidadas em degradê chá, abraçadas pela pantera em ouro 18K esmaltada à mão.",
            }}
            finale={{
              name: "Pantera · Sem Aro & Ouro 18K",
              subtitle: "O favorito da campanha",
              onTry: () => openTry(pantherVariantId(pantera)),
              purchaseUrl: pantera.variants[0].purchaseUrl,
              onPurchase: () => trackPurchase(pantera.variants[0].id, pantera.variants[0].sku, "sequence_pantera"),
            }}
          />

          {/* ============================================================
              FECHAMENTO DE CONVERSÃO — "Agora, veja em você."
             ============================================================ */}
          <section className="bg-white px-6 py-24 text-center md:py-36">
            <h2 data-reveal className="t-hero mx-auto max-w-[980px]">
              Agora, veja{" "}
              <span
                className="mx-1 inline-block h-[0.82em] w-[2.1em] rounded-full bg-no-repeat align-[-0.08em]"
                style={{
                  backgroundImage: "url(/images/anna/anna-07-ambar-frente.jpg)",
                  backgroundSize: "190%",
                  backgroundPosition: "48% 38%",
                }}
                role="img"
                aria-label="Anna usando o Solaris"
              />{" "}
              em você.
            </h2>
            <p data-reveal className="t-intro mx-auto mt-5 max-w-[540px] text-[#6e6e73]">
              Abra o espelho virtual pela câmera, compare os 4 modelos ao vivo no seu rosto e garanta o seu favorito.
            </p>
            <div data-reveal className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => openTry(firstApprovedVariantId)} className="btn btn-primary">
                Abrir provador agora
              </button>
              <a
                href="#colecao"
                onClick={(e) => smoothJump(e, "colecao")}
                className="btn btn-secondary"
              >
                Ver os 4 modelos
              </a>
            </div>
          </section>

          {/* ============================================================
              RODAPÉ
             ============================================================ */}
          <footer className="border-t border-[#d2d2d7] bg-[#f5f5f7] px-6 py-8 text-[12px] text-[#6e6e73]">
            <div className="mx-auto flex max-w-[1160px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>Encantadas · Coleção Assinada por Anna</span>
              <span>© 2026 Encantadas. Todos os direitos reservados.</span>
            </div>
          </footer>
        </div>
      </main>

      <TryOnModal
        isOpen={isTryOnOpen}
        initialVariantId={tryVariantId}
        catalog={catalog}
        manifest={manifest}
        onClose={() => setIsTryOnOpen(false)}
        onSelectVariant={(id) => setTryVariantId(id)}
      />
    </div>
  );
}

function pantherVariantId(pantera: Product): string {
  return pantera.variants[0]?.id ?? "var-pantera-cha";
}
