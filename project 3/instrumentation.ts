// Hook instrumentacji Nexta (experimental.instrumentationHook w next.config).
// Cała node-owa telemetria pamięci żyje w instrumentation-node.ts — dynamiczny
// import za guardem NEXT_RUNTIME jest WZORCEM z doków Nexta: NEXT_RUNTIME jest
// inline'owane per-runtime-build, więc edge-build eliminuje gałąź (DCE) i nie
// próbuje resolvować node-builtinów (v8/module), które wywalały webpack.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerMemTelemetry } = await import('./instrumentation-node');
    registerMemTelemetry();
  }
}
