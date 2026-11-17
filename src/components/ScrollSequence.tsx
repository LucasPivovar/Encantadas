"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

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
 * Vídeo 100% Width em Fundo Branco Puro (#FFFFFF):
 * - Zero borrões ou gradientes laterais artificiais.
 * - O ciclorama dos quadros foi calibrado para #FFFFFF puro, fundindo-se
 *   de forma invisível com a página.
 * - O óculos permanece centralizado e inteiro na tela (nunca sobe para trás do header).
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

    const bitmaps: (HTMLImageElement | null)[] = new Array(frameCount).fill(null);
    let dirty = true;
    let rafId = 0;

    const frameSrc = (i: number) => `${folder}/${String(i + 1).padStart(3, "0")}.webp`;

    const pickLoaded = (index: number) => {
      const clamped = Math.max(0, Math.min(frameCount - 1, index));
      for (let i = clamped; i >= 0; i--) {
        if (bitmaps[i]) return bitmaps[i];
      }
      for (let i = clamped + 1; i < frameCount; i++) {
        if (bitmaps[i]) return bitmaps[i];
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

      if (Math.abs(df) > 0.008 || Math.abs(dz) > 0.0005) {
        current.frame += df * 0.14;
        current.zoom += dz * 0.14;
        dirty = true;
      }

      if (dirty) {
        draw();
        dirty = false;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // Carregamento progressivo em lotes de 8 imagens para nunca travar a CPU do celular
    let cancelled = false;

    const loadBatch = (startIdx: number) => {
      if (cancelled || startIdx >= frameCount) return;
      const batchSize = 8;
      let completed = 0;
      const count = Math.min(batchSize, frameCount - startIdx);

      for (let i = startIdx; i < startIdx + count; i++) {
        const img = new Image();
        img.decoding = "async";
        img.src = frameSrc(i);
        const onDone = () => {
          if (cancelled) return;
          if (img.naturalWidth > 0) {
            bitmaps[i] = img;
            if (i === 0 || Math.abs(i - Math.round(current.frame)) <= 2) {
              dirty = true;
            }
          }
          completed++;
          if (completed === count) {
            setTimeout(() => loadBatch(startIdx + batchSize), 16);
          }
        };
        img.onload = onDone;
        img.onerror = onDone;
      }
    };

    loadBatch(0);

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

      gsap.set(q("[data-seq]"), { autoAlpha: 0, y: 22 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });

      tl.to(target, { frame: frameCount - 1, duration: 1 }, 0)
        .to(q('[data-seq="intro"]'), { autoAlpha: 1, y: 0, duration: 0.08, ease: "power2.out" }, 0.02)
        .to(q('[data-seq="intro"]'), { autoAlpha: 0, y: -20, duration: 0.08, ease: "power2.in" }, 0.28)
        .to(q('[data-seq="feature"]'), { autoAlpha: 1, y: 0, duration: 0.08, ease: "power2.out" }, 0.36)
        .to(q('[data-seq="feature"]'), { autoAlpha: 0, y: -20, duration: 0.08, ease: "power2.in" }, 0.62)
        .to(target, { zoom: 0.9, duration: 0.14, ease: "power2.inOut" }, 0.64)
        .to(q('[data-seq="finale"]'), { autoAlpha: 1, y: 0, duration: 0.1, ease: "power2.out" }, 0.72);
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
      className="relative h-[240svh] md:h-[220svh] motion-reduce:h-svh bg-white"
    >
      <div className="sticky top-0 h-svh overflow-hidden bg-white">
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />

        {/* Textos superiores (abaixo do header fixo) */}
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

        {/* Final da animação: Nome + Provar no rosto e Garantir o meu */}
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
