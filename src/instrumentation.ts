export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    // Heavy recovery and collection run in the supervised backend, not the web process.
    process.on("message", function parentMessage(message: unknown) {
      if (message && typeof message === "object" && "shutdown" in message && message.shutdown === true) process.exit(0);
    });
    process.once("disconnect", function parentExited() { process.exit(0); });
  }
}
