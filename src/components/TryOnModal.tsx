"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, ChevronUp, Loader2, Minus, Plus, X } from "lucide-react";
import type { CatalogData, TryOnErrorCode, TryOnManifest, TryOnState } from "@/types/catalog";
import { getVariantById, isTryOnApproved } from "@/lib/catalog";
import { getProductMedia } from "@/lib/product-media";
import { PrototypeTryOnAdapter } from "@/lib/tryon-adapter";
import { trackEvent } from "@/lib/telemetry";
import { EyewearSvg } from "./EyewearSvg";

interface TryOnModalProps {
  isOpen: boolean;
  initialVariantId: string;
  catalog: CatalogData;
  manifest: TryOnManifest;
  onClose: () => void;
  onSelectVariant: (variantId: string) => void;
}

const ERRORS: Record<TryOnErrorCode, { title: string; body: string }> = {
  CAMERA_DENIED: {
    title: "A câmera não foi liberada.",
    body: "Autorize a câmera nas configurações do navegador ou veja o modelo na Anna.",
  },
  CAMERA_UNAVAILABLE: {
    title: "Nenhuma câmera encontrada.",
    body: "Ela pode estar em uso por outro aplicativo. Feche-o e tente de novo.",
  },
  UNSUPPORTED: {
    title: "Este navegador não abre a câmera.",
    body: "Se você está no Instagram ou WhatsApp, abra o link no Safari ou no Chrome.",
  },
  ASSET_UNAVAILABLE: {
    title: "Este modelo ainda não está no provador.",
    body: "Escolha outro modelo ao lado.",
  },
  LICENSE_ERROR: {
    title: "O provador está indisponível agora.",
    body: "Tente novamente em instantes.",
  },
  TRACKING_LOST: {
    title: "Não encontramos seu rosto.",
    body: "Centralize o rosto e evite movimentos rápidos.",
  },
  LOAD_TIMEOUT: {
    title: "A conexão está lenta.",
    body: "Tente novamente em instantes.",
  },
};

type StageMode = "intro" | "camera" | "anna";

export function TryOnModal({
  isOpen,
  initialVariantId,
  catalog,
  manifest,
  onClose,
  onSelectVariant,
}: TryOnModalProps) {
  const [state, setState] = useState<TryOnState>("closed");
  const [mode, setMode] = useState<StageMode>("intro");
  const [errorCode, setErrorCode] = useState<TryOnErrorCode | null>(null);
  const [variantId, setVariantId] = useState(initialVariantId);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(1);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const adapterRef = useRef<PrototypeTryOnAdapter | null>(null);
  const wasOpenRef = useRef(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  if (!adapterRef.current) adapterRef.current = new PrototypeTryOnAdapter(manifest);

  const selection = useMemo(() => getVariantById(variantId, catalog), [variantId, catalog]);

  const options = useMemo(
    () =>
      catalog.products.map((p) => ({
        product: p,
        variant: p.variants[0],
        approved: isTryOnApproved(p.variants[0].id, manifest),
      })),
    [catalog, manifest]
  );

  const stopCamera = useCallback(() => {
    adapterRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Abertura / fechamento
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setVariantId(initialVariantId);
      setMode("intro");
      setErrorCode(null);
      setOffsetY(0);
      setScale(1);
      setState("explanation");
      trackEvent("tryon_open", { variantId: initialVariantId });
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    } else if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      stopCamera();
      setState("closed");
    }
  }, [isOpen, initialVariantId, stopCamera]);

  // Trava o scroll da página por trás
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Libera a câmera ao trocar de aba
  useEffect(() => {
    if (!isOpen) return;
    const onVis = () => {
      if (document.hidden && mode === "camera") {
        stopCamera();
        setState("ended");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isOpen, mode, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Liga o stream ao <video>
  useEffect(() => {
    if (mode === "camera" && state === "trying_on" && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [mode, state]);

  const handleClose = useCallback(() => {
    stopCamera();
    setState("closed");
    onClose();
  }, [onClose, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, handleClose]);

  const startCamera = async () => {
    setMode("camera");
    setErrorCode(null);
    setState("requesting_camera");
    const result = await adapterRef.current!.open(variantId);
    if (!result.ok || !result.stream) {
      const code = result.errorCode ?? "CAMERA_UNAVAILABLE";
      setErrorCode(code);
      setState("error");
      trackEvent(code === "CAMERA_DENIED" ? "camera_denied" : "tryon_error", { variantId, errorCode: code });
      return;
    }
    streamRef.current = result.stream;
    trackEvent("camera_granted", { variantId });
    setState("trying_on");
    trackEvent("tryon_ready", { variantId, sku: selection?.variant.sku });
  };

  const showOnAnna = () => {
    stopCamera();
    setErrorCode(null);
    setMode("anna");
    setState("trying_on");
  };

  const selectVariant = async (nextId: string) => {
    if (nextId === variantId) return;
    const res = await adapterRef.current!.selectVariant(nextId);
    if (!res.ok) return;
    setVariantId(nextId);
    onSelectVariant(nextId);
    const match = getVariantById(nextId, catalog);
    trackEvent("variant_selected", { variantId: nextId, sku: match?.variant.sku, source: "tryon" });
  };

  if (!isOpen || !selection) return null;

  const { product, variant } = selection;
  const media = getProductMedia(product.id);
  const isCameraLive = mode === "camera" && state === "trying_on";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 backdrop-blur-sm md:items-center md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Provar ${media.shortName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white md:h-[min(86svh,760px)] md:max-w-[1080px] md:flex-row md:rounded-[28px] md:shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
        <button
          ref={closeBtnRef}
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-[#e8e8ed] text-[#1d1d1f] transition-colors hover:bg-[#dcdce1]"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        {/* ================= PALCO ================= */}
        <div className={`relative min-h-0 flex-1 overflow-hidden ${isCameraLive ? "bg-black" : "bg-[#f5f5f7]"}`}>
          {/* Introdução */}
          {mode === "intro" && (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <EyewearSvg variant={variant} className="h-auto w-full max-w-[360px]" />
              <h2 className="t-headline mt-10 text-[#1d1d1f]">Veja em você.</h2>
              <p className="mt-3 max-w-[380px] text-[17px] text-[#6e6e73]">
                Usamos só a câmera, nunca o microfone. Nada é gravado ou enviado.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button type="button" onClick={startCamera} className="btn btn-primary">
                  <Camera className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  Usar câmera
                </button>
                <button type="button" onClick={showOnAnna} className="btn btn-secondary">
                  Ver na Anna
                </button>
              </div>
            </div>
          )}

          {/* Pedindo permissão */}
          {mode === "camera" && state === "requesting_camera" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[#6e6e73]">
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.75} />
              <p className="text-[15px]">Aguardando a câmera…</p>
            </div>
          )}

          {/* Câmera ao vivo */}
          {isCameraLive && (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className="w-[58%] max-w-[380px] drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)] transition-transform duration-150"
                  style={{ transform: `translateY(calc(-9% + ${offsetY}px)) scale(${scale})` }}
                >
                  <EyewearSvg variant={variant} className="h-auto w-full" />
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-5 flex justify-center">
                <div className="flex items-center gap-1 rounded-full bg-white/85 p-1 backdrop-blur-md">
                  {[
                    { label: "Subir", icon: ChevronUp, on: () => setOffsetY((y) => y - 6) },
                    { label: "Descer", icon: ChevronDown, on: () => setOffsetY((y) => y + 6) },
                    { label: "Diminuir", icon: Minus, on: () => setScale((s) => Math.max(0.7, +(s - 0.05).toFixed(2))) },
                    { label: "Aumentar", icon: Plus, on: () => setScale((s) => Math.min(1.4, +(s + 0.05).toFixed(2))) },
                  ].map(({ label, icon: Icon, on }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={on}
                      aria-label={label}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-[#1d1d1f] transition-colors hover:bg-black/5"
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Na Anna */}
          {mode === "anna" && (
            <div className="flex h-full items-center justify-center">
              {media.annaPhoto ? (
                <img
                  src={media.annaPhoto}
                  alt={`Anna usando o ${media.shortName}`}
                  className="h-full w-full object-cover object-[50%_30%]"
                />
              ) : (
                <div className="px-8 text-center">
                  <EyewearSvg variant={variant} className="mx-auto h-auto w-full max-w-[420px]" />
                  <p className="mt-8 text-[17px] text-[#6e6e73]">
                    Ainda não temos foto da Anna com o {media.shortName}.
                  </p>
                  <button type="button" onClick={startCamera} className="btn btn-primary mt-6">
                    <Camera className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    Provar com a câmera
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Câmera pausada ao sair da aba */}
          {state === "ended" && (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <p className="t-subhead text-[#1d1d1f]">A câmera foi pausada.</p>
              <button type="button" onClick={startCamera} className="btn btn-primary mt-6">
                Retomar
              </button>
            </div>
          )}

          {/* Erros */}
          {state === "error" && errorCode && (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <p className="t-subhead text-[#1d1d1f]">{ERRORS[errorCode].title}</p>
              <p className="mt-3 max-w-[380px] text-[17px] text-[#6e6e73]">{ERRORS[errorCode].body}</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button type="button" onClick={startCamera} className="btn btn-primary">
                  Tentar de novo
                </button>
                <button type="button" onClick={showOnAnna} className="btn btn-secondary">
                  Ver na Anna
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ================= LATERAL / BOTTOM SHEET ================= */}
        <aside className="flex max-h-[44svh] shrink-0 flex-col gap-4 overflow-y-auto border-t border-[#d2d2d7] bg-white p-5 sm:p-6 md:max-h-none md:w-[340px] md:gap-6 md:border-l md:border-t-0 md:p-8">
          <div className="md:pt-8">
            <h3 className="text-[22px] sm:text-[28px] font-semibold leading-tight tracking-[0.007em] text-[#1d1d1f]">
              {media.shortName}
            </h3>
            <p className="mt-0.5 sm:mt-1 text-[13px] sm:text-[14px] text-[#6e6e73]">{media.tagline}</p>
          </div>

          <div>
            <p className="text-[13px] sm:text-[14px] font-semibold text-[#1d1d1f]">Modelo</p>
            <div className="no-scrollbar mt-2.5 sm:mt-3 flex gap-2 overflow-x-auto md:grid md:grid-cols-2 md:overflow-visible">
              {options.map(({ product: p, variant: v, approved }) => {
                const m = getProductMedia(p.id);
                const active = p.id === product.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!approved}
                    onClick={() => selectVariant(v.id)}
                    aria-pressed={active}
                    className={`flex w-[108px] shrink-0 flex-col items-center gap-1.5 rounded-[14px] px-2 pb-2 pt-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:w-auto ${
                      active ? "bg-white ring-2 ring-[#1d1d1f]" : "bg-[#f5f5f7] hover:bg-[#ececf0]"
                    }`}
                  >
                    <img src={m.front} alt="" className="h-8 sm:h-9 w-full object-contain" />
                    <span className="text-[12px] text-[#1d1d1f]">{m.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2.5 sm:gap-3">
            <div className="flex gap-2.5 md:flex-col">
              <a
                href={variant.purchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("purchase_click", { variantId: variant.id, sku: variant.sku, source: "tryon" })}
                className="btn btn-primary flex-1 md:w-full"
              >
                Comprar
              </a>
              {mode !== "camera" && (
                <button type="button" onClick={startCamera} className="btn btn-secondary flex-1 md:w-full">
                  Usar câmera
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
