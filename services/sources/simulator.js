import { start as startA, stop as stopA } from "./source-a.js";
import { start as startB, stop as stopB } from "./source-b.js";

console.log("[Simulator] Launching both data sources…");

startA();
startB();

function shutdown() {
  console.log("\n[Simulator] Shutting down…");
  stopA();
  stopB();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
