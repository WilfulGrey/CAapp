// Per-request telemetria pamięci dla API route'ów (diagnoza OOM 512MB —
// plan 2026-08-09). Wrapper NIE zmienia semantyki handlera: response i błędy
// przechodzą 1:1, log leci w finally.
//
// Format (grep: „[req]"):
//   [req] <name> status=<n> ms=<n> rss=<a>→<b>MB (Δ<x>) heapΔ=<y>MB size=<bajty|—>
//
// UWAGA interpretacyjna: Δrss per request bywa zaszumione (GC, równoległe
// requesty) — pojedyncza linia to poszlaka; wzorzec wielu linii + sampler
// [mem] z instrumentation.ts to dowód.

const MB = (b: number) => Math.round(b / 1048576);

// Generic po typie requestu (NextRequest ⊂ Request) i kontekstu ({params})
// — wrapper zachowuje DOKŁADNĄ sygnaturę handlera (strictFunctionTypes).
export function withMem<Req extends Request = Request, Ctx = unknown>(
  name: string,
  handler: (req: Req, ctx: Ctx) => Promise<Response> | Response,
  opts: { sampleRate?: number; alwaysLogAboveDeltaMb?: number } = {},
): (req: Req, ctx: Ctx) => Promise<Response> {
  const sampleRate = opts.sampleRate ?? 1; // 1 = loguj każdy request
  const alwaysAbove = (opts.alwaysLogAboveDeltaMb ?? 8) * 1048576;
  let counter = 0;

  return async function wrapped(req: Req, ctx: Ctx): Promise<Response> {
    const before = process.memoryUsage();
    const t0 = Date.now();
    let status = -1;
    let size: number | null = null;
    try {
      const res = await handler(req, ctx);
      status = res.status;
      const len = res.headers.get('content-length');
      size = len ? Number(len) : null;
      return res;
    } catch (err) {
      status = -500; // handler rzucił (Next zamieni na 500)
      throw err;
    } finally {
      const after = process.memoryUsage();
      const delta = after.rss - before.rss;
      counter += 1;
      const sampledOut = sampleRate > 1 && counter % sampleRate !== 0 && Math.abs(delta) < alwaysAbove;
      if (!sampledOut) {
        console.log(
          `[req] ${name} status=${status} ms=${Date.now() - t0} ` +
            `rss=${MB(before.rss)}→${MB(after.rss)}MB (Δ${delta >= 0 ? '+' : ''}${MB(delta)}) ` +
            `heapΔ=${MB(after.heapUsed - before.heapUsed)}MB size=${size ?? '—'}`,
        );
      }
    }
  };
}
