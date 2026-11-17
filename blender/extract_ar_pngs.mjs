/**
 * Extrai exatamente os recortes frontais reais de alta definição dos 4 óculos
 * a partir das fotos de estúdio originais enviadas pela usuária e converte o
 * fundo branco de estúdio em canal Alpha transparente (PNG RGBA) preservando
 * 100% da textura fotográfica real (ouro 18K do leão, pintas da pantera,
 * tartaruga real, reflexo e transparência degradê das lentes) para uso em
 * Realidade Aumentada (AR Try-On) e vitrine limpa do site.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ============================================================================
// DECODIFICADOR JPEG PURO (Baseline DCT SOF0) PARA EXTRAIR PIXELS REAIS DA FOTO
// ============================================================================
// Como o Windows possui System.Drawing (.NET) nativo via PowerShell, podemos
// usar o próprio GDI+ nativo do Windows para decodificar os JPEGs com precisão
// absoluta de cor e salvar PNGs 32-bit RGBA transparentes!
