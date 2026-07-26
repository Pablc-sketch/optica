import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts"],
    // Contra un Supabase en la nube cada consulta viaja por internet y el
    // plan gratuito limita las operaciones de Auth por minuto. Los archivos
    // corren de a uno y con tiempos holgados: en paralelo se pisan entre
    // ellos y fallan por límite de tasa, no por un defecto real.
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 90000,
  },
});
