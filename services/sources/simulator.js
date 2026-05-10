import { start as startA, stop as stopA } from "./source-a.js";
import { start as startB, stop as stopB } from "./source-b.js";

console.log("[BADGER Guard Simulator] Launching autonomous fleet platform sources…");

startA();
startB();

function shutdown() {
  console.log("\n[BADGER Guard Simulator] Shutting down autonomous fleet simulation…");
  stopA();
  stopB();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
