import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // O mesmo apelido "@" que o tsconfig usa. Sem isto, um módulo testado que
  // importe "@/lib/..." falha só nos testes — e o erro parece de código, não
  // de configuração.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
