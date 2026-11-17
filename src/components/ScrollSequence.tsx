"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { getPreloadedSequence } from "@/lib/asset-preloader";

interface ScrollSequenceProps {
  folder: string;
  frameCount: number;
  backdrop?: string;
  intro: string;
  feature: { title: string; text: string };
  finale: {
    name: string;
    subtitle?: string;
    onTry: () => void;
    purchaseUrl: string;
    onPurchase?: () => void;
  };
}

/**
 * Vídeo Scrubbing Sem Flicks e Lento/Cinematográfico no Celular:
 * - Usa diretamente os quadros já pré-decodificados na memória pelo Preloader.
 * - Altura de 360svh no mobile (3.6x a tela) para a pessoa rolar vários toques
 *   apreciando cada grau de rotação do óculos e cada texto com calma.
 */
export function ScrollSequence({
  folder,
  frameCount,
  backdrop = "#ffffff",
  intro,
  feature,
  finale,
}: ScrollSequenceProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const ctx2d = canvas.getContext("2d", { alpha: false });
    if (!ctx2d) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const target = {
      frame: reduceMotion ? frameCount - 1 : 0,
      zoom: reduceMotion ? 0.88 : 1,
    };
    const current = {
      frame: target.frame,
      zoom: target.zoom,
    };

    // Usa o array já decodificado pelo preloader; fallback caso acesso direto
    const preloaded = getPreloadedSequence(folder);
    const images: (HTMLImageElement | null)[] = preloaded
      ? [...preloaded]
      : new Array(frameCount).fill(null);

    let dirty = true;
    let rafId = 0;

    const frameSrc = (i: number) => `${folder}/${String(i + 1).padStart(3, "0")}.webp`;

    const pickLoaded = (index: number) => {
      const clamped = Math.max(0, Math.min(frameCount - 1, index));
      for (let i = clamped; i >= 0; i--) {
        const im = images[i];
        if (im && im.complete && im.naturalWidth > 0) return im;
      }
      for (let i = clamped + 1; i < frameCount; i++) {
        const im = images[i];
        if (im && im.complete && im.naturalWidth > 0) return im;
      }
      return null;
    };

    const draw = () => {
      const source = pickLoaded(Math.round(current.frame));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }

      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.fillStyle = backdrop;
      ctx2d.fillRect(0, 0, cw, ch);
      if (!source) return;

      const iw = source.naturalWidth;
      const ih = source.naturalHeight;

      const maxH = ch * 0.62;
      const maxW = cw * 0.92;
      const scale = Math.min(maxW / iw, maxH / ih) * current.zoom;
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;

      ctx2d.imageSmoothingEnabled = true;
      ctx2d.imageSmoothingQuality = "high";
      ctx2d.drawImage(source, dx, dy, dw, dh);
    };

    const tick = () => {
      const df = target.frame - current.frame;
      const dz = target.zoom - current.zoom;

      if (Math.abs(df) > 0.005 || Math.abs(dz) > 0.0004) {
        current.frame += df * 0.12;
        current.zoom += dz * 0.12;
        dirty = true;
      }

      if (dirty) {
        draw();
        dirty = false;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // Se por algum motivo não veio do preloader, carrega em background
    let cancelled = false;
    if (!preloaded) {
      for (let i = 0; i < frameCount; i++) {
        const img = new Image();
        img.decoding = "async";
        img.src = frameSrc(i);
        img.onload = () => {
          if (cancelled) return;
          images[i] = img;
          if (i === 0 || Math.abs(i - Math.round(current.frame)) <= 2) dirty = true;
        };
      }
    }

    const onResize = () => {
      dirty = true;
    };
    window.addEventListener("resize", onResize, { passive: true });

    gsap.registerPlugin(ScrollTrigger);
    const q = gsap.utils.selector(section);

    const gctx = gsap.context(() => {
      if (reduceMotion) {
        gsap.set(q('[data-seq="intro"]'), { autoAlpha: 0 });
        gsap.set(q('[data-seq="feature"], [data-seq="finale"]'), { autoAlpha: 1, y: 0 });
        dirty = true;
        return;
      }

      gsap.set(q("[data-seq]"), { autoAlpha: 0, y: 20 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });

      tl.to(target, { frame: frameCount - 1, duration: 1 }, 0)
        .to(q('[data-seq="intro"]'), { autoAlpha: 1, y: 0, duration: 0.1, ease: "power2.out" }, 0.02)
        .to(q('[data-seq="intro"]'), { autoAlpha: 0, y: -18, duration: 0.1, ease: "power2.in" }, 0.28)
        .to(q('[data-seq="feature"]'), { autoAlpha: 1, y: 0, duration: 0.1, ease: "power2.out" }, 0.36)
        .to(q('[data-seq="feature"]'), { autoAlpha: 0, y: -18, duration: 0.1, ease: "power2.in" }, 0.64)
        .to(target, { zoom: 0.9, duration: 0.14, ease: "power2.inOut" }, 0.66)
        .to(q('[data-seq="finale"]'), { autoAlpha: 1, y: 0, duration: 0.12, ease: "power2.out" }, 0.74);
    }, section);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      gctx.revert();
    };
  }, [folder, frameCount, backdrop]);

  return (
    <section
      ref={sectionRef}
      className="relative h-[360svh] md:h-[280svh] motion-reduce:h-svh bg-white"
    >
      <div className="sticky top-0 h-svh overflow-hidden bg-white">
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />

        {/* Textos superiores */}
        <div className="pointer-events-none absolute inset-x-0 top-[76px] sm:top-[92px] px-5 sm:px-6 text-center">
          <div className="relative mx-auto max-w-[820px]">
            <h2 data-seq="intro" className="t-headline absolute inset-x-0 top-0 text-[#1d1d1f]">
              {intro}
            </h2>
            <div data-seq="feature" className="absolute inset-x-0 top-0">
              <h2 className="t-headline text-[#1d1d1f]">{feature.title}</h2>
              <p className="t-intro mx-auto mt-2 sm:mt-2.5 max-w-[540px] text-[#6e6e73]">{feature.text}</p>
            </div>
          </div>
        </div>

        {/* Final da animação */}
        <div
          data-seq="finale"
          className="absolute inset-x-0 bottom-[6svh] sm:bottom-[7svh] px-5 sm:px-6 text-center"
        >
          <p className="t-subhead text-[#1d1d1f]">{finale.name}</p>
          {finale.subtitle && (
            <p className="mt-1 text-[14px] sm:text-[15px] text-[#6e6e73]">{finale.subtitle}</p>
          )}
          <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            <button type="button" onClick={finale.onTry} className="btn btn-secondary btn-sm sm:min-h-[44px] sm:px-[22px] sm:text-[17px]">
              Provar no rosto
            </button>
            <a
              href={finale.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={finale.onPurchase}
              className="btn btn-primary btn-sm sm:min-h-[44px] sm:px-[22px] sm:text-[17px]"
            >
              Garantir o meu
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
