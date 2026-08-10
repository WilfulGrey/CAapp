// Node-owa część telemetrii pamięci (diagnoza OOM >512MB na Render — plan
// 2026-08-09). Ładowana WYŁĄCZNIE dynamicznie z instrumentation.ts za guardem
// NEXT_RUNTIME==='nodejs' — dzięki temu edge-build Nexta nigdy nie próbuje
// resolvować node-builtinów (v8, module), a DCE wycina całą gałąź.
//
// Linie (grep-owalne):
//   [mem:boot]     — raz na start: node, heap-limit, NODE_OPTIONS, sharp?
//   [mem]          — próbka co 15 s: rss/heap/external/arrayBuffers
//   [mem:spike]    — natychmiast, gdy Δrss ≥ 32MB między próbkami
//   [mem:critical] — rss > 440MB (przedsionek OOM-a przy limicie 512)
//   [mem:crash]    — nieobsłużony wyjątek + stan pamięci (monitor, nie handler)
//
// Jak czytać (sygnatury winowajców — patrz plan):
//   ext/ab puchnie + burst [img]   → squoosh (next/image bez sharpa)
//   heap puchnie / V8 heap-OOM     → duże tablice JS (np. analytics/stats)
//   schodki rss po [req] mailowych → orphan-promises nodemailera
//   dryf rss bez requestów         → leak tła (timery/klienty)
import { getHeapStatistics } from 'node:v8';
import { createRequire } from 'node:module';

export function registerMemTelemetry() {
  const MB = (b: number) => Math.round(b / 1048576);

  let sharpResolvable = false;
  try {
    createRequire(import.meta.url ?? `file://${process.cwd()}/`).resolve('sharp');
    sharpResolvable = true;
  } catch {
    sharpResolvable = false;
  }

  const heapLimitMb = MB(getHeapStatistics().heap_size_limit);
  console.log(
    `[mem:boot] node=${process.version} heapLimit=${heapLimitMb}MB ` +
      `NODE_OPTIONS="${process.env.NODE_OPTIONS ?? ''}" sharp=${sharpResolvable} ` +
      `build=${process.env.NEXT_PUBLIC_BUILD_ID ?? '?'} pid=${process.pid}`,
  );
  if (!sharpResolvable) {
    console.warn(
      '[mem:boot] sharp NIEDOSTĘPNY — next/image optymalizuje squoosh-WASM-em W PROCESIE (podejrzany #1 OOM-a)',
    );
  }

  let lastRss = process.memoryUsage().rss;
  const startedAt = Date.now();

  const interval = setInterval(() => {
    const m = process.memoryUsage();
    const up = Math.round((Date.now() - startedAt) / 1000);
    const tag = m.rss > 440 * 1048576 ? '[mem:critical]' : '[mem]';
    console.log(
      `${tag} up=${up}s rss=${MB(m.rss)}MB heap=${MB(m.heapUsed)}/${MB(m.heapTotal)}MB ` +
        `ext=${MB(m.external)}MB ab=${MB(m.arrayBuffers)}MB`,
    );
    const delta = m.rss - lastRss;
    if (delta >= 32 * 1048576) {
      console.warn(`[mem:spike] Δrss=+${MB(delta)}MB (→${MB(m.rss)}MB w ≤15s)`);
    }
    lastRss = m.rss;
  }, 15_000);
  interval.unref(); // nigdy nie blokuj shutdownu

  // Śmierć z diagnozą — WYŁĄCZNIE obserwacja, zero wpływu na zachowanie:
  // uncaughtExceptionMonitor odpala się przy nieobsłużonym wyjątku, ale NIE
  // wyłącza domyślnego crasha (zwykły listener na 'uncaughtException' by
  // wyłączył — a wymuszony exit(1) mógłby ubić proces, który Next sam
  // obsługuje). unhandledRejection w Node ≥15 i tak eskaluje do uncaught
  // (--unhandled-rejections=throw default) ⇒ monitor łapie oba przypadki.
  process.on('uncaughtExceptionMonitor', (err, origin) => {
    const m = process.memoryUsage();
    console.error(
      `[mem:crash] ${origin} rss=${MB(m.rss)}MB heap=${MB(m.heapUsed)}/${MB(m.heapTotal)}MB ` +
        `ext=${MB(m.external)}MB: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
    );
  });
}
