"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SiteHeaderProps {
  onTry: () => void;
  backHref?: string;
}

/**
 * Header de maison: wordmark centralizado, ação única à direita.
 * Transparente sobre o hero; ganha fundo translúcido e linha fina ao rolar.
 */
export function SiteHeader({ onTry, backHref }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || Boolean(backHref);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        solid
          ? "bg-white/80 shadow-[0_1px_0_rgba(0,0,0,0.08)] backdrop-blur-xl backdrop-saturate-150"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto grid h-14 sm:h-16 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 md:px-10">
        <div className="justify-self-start">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex min-h-10 items-center text-[13px] tracking-[0.02em] text-[#1d1d1f]/70 transition-colors hover:text-[#1d1d1f]"
            >
              Voltar
            </Link>
          )}
        </div>

        <a
          href={backHref ?? "#topo"}
          className="justify-self-center text-[13px] sm:text-[15px] md:text-[17px] font-medium uppercase tracking-[0.24em] sm:tracking-[0.32em] text-[#1d1d1f]"
          aria-label="Encantadas — início"
        >
          Encantadas
        </a>

        <div className="justify-self-end">
          <button
            type="button"
            onClick={onTry}
            className="min-h-10 sm:min-h-9 rounded-full border border-[#1d1d1f] px-4 sm:px-5 text-[12px] sm:text-[13px] tracking-[0.02em] text-[#1d1d1f] transition-colors duration-200 hover:bg-[#1d1d1f] hover:text-white active:scale-[0.97]"
          >
            Provar
          </button>
        </div>
      </div>
    </header>
  );
}
