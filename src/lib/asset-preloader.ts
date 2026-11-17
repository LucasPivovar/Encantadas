/**
 * Registro Global de Quadros Pré-Decodificados na Memória/GPU.
 * A tela de abertura ("ENCANTADAS") pré-carrega e chama `img.decode()` em todos
 * os quadros dos vídeos e imagens principais ANTES de liberar a página,
 * garantindo ZERO flicks / piscadas durante o scroll.
 */

const frameRegistry: Record<string, HTMLImageElement[]> = {};

export function getPreloadedSequence(folder: string): HTMLImageElement[] | undefined {
  return frameRegistry[folder];
}

export async function preloadAllSiteAssets(
  onProgress: (pct: number) => void
): Promise<void> {
  const sequences = [
    { folder: "/sequences/imperial", count: 120 },
    { folder: "/sequences/pantera", count: 120 },
  ];

  const staticImages = [
    "/images/anna/anna-hero-wide.jpg",
    "/images/ar/anna-hero-clean.jpg",
    "/images/products/pantera-front.png",
    "/images/products/imperial-front.png",
    "/images/ar/ar-02-navigator-ambar.png",
    "/images/ar/ar-04-bold-tartaruga.png",
    "/images/anna/anna-02-pantera-pose.jpg",
    "/images/anna/anna-07-ambar-frente.jpg",
    "/images/anna/anna-08-bold-maos.jpg",
    "/images/anna/anna-03-pantera-perfil.jpg",
  ];

  const glbUrls = [
    "/models/oculos-01-imperial-leao.glb",
    "/models/oculos-02-navigator-ambar.glb",
    "/models/oculos-03-rimless-pantera.glb",
    "/models/oculos-04-bold-tartaruga.glb",
  ];

  const totalTasks =
    sequences.reduce((acc, s) => acc + s.count, 0) +
    staticImages.length +
    glbUrls.length;
  let completed = 0;

  const bump = () => {
    completed++;
    onProgress(Math.min(100, Math.round((completed / totalTasks) * 100)));
  };

  const decodeImg = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      img.onload = () => {
        if (typeof img.decode === "function") {
          img
            .decode()
            .catch(() => {})
            .finally(() => {
              bump();
              resolve(img);
            });
        } else {
          bump();
          resolve(img);
        }
      };
      img.onerror = () => {
        bump();
        resolve(img);
      };
    });

  // 1. Pré-carrega imagens estáticas e GLBs em lotes controlados
  await Promise.all([
    ...staticImages.map((u) => decodeImg(u)),
    ...glbUrls.map((u) =>
      fetch(u)
        .catch(() => {})
        .finally(() => bump())
    ),
  ]);

  // 2. Pré-carrega e decodifica na memória todos os 240 quadros das 2 sequências
  for (const seq of sequences) {
    if (frameRegistry[seq.folder]?.length === seq.count) {
      completed += seq.count;
      onProgress(Math.min(100, Math.round((completed / totalTasks) * 100)));
      continue;
    }

    const arr: HTMLImageElement[] = new Array(seq.count);
    const concurrency = 16;

    for (let start = 0; start < seq.count; start += concurrency) {
      const batch: Promise<void>[] = [];
      for (let i = start; i < Math.min(seq.count, start + concurrency); i++) {
        const src = `${seq.folder}/${String(i + 1).padStart(3, "0")}.webp`;
        batch.push(
          decodeImg(src).then((img) => {
            arr[i] = img;
          })
        );
      }
      await Promise.all(batch);
    }

    frameRegistry[seq.folder] = arr;
  }

  onProgress(100);
}
