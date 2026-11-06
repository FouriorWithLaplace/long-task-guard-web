import fs from "node:fs";
import path from "node:path";
import { CodexClient } from "../codex-client.ts";
import { findCodexExecutable } from "../model-catalog.ts";
import { GuardTerminalService } from "../guard-terminal-service.ts";
import { paths } from "./config.ts";
import { EncyclopediaManager } from "./manager.ts";

const shared = globalThis as typeof globalThis & {
  encyclopediaService?: {
    manager: EncyclopediaManager;
    terminals: GuardTerminalService;
  };
};
export function getEncyclopediaService() {
  if (!shared.encyclopediaService) {
    const skillFile = path.join(
      process.cwd(),
      "skills",
      "encyclopedia-collect",
      "SKILL.md",
    );
    const skill = fs.readFileSync(skillFile, "utf8");
    const manager = new EncyclopediaManager(
      paths,
      function connect(events, temp) {
        return new CodexClient(
          findCodexExecutable(),
          paths.workspace,
          events,
          "websocket",
          { experimentalApi: true, tempDirectory: temp },
        );
      },
      skill,
    );
    shared.encyclopediaService = {
      manager,
      terminals: new GuardTerminalService(manager),
    };
    function closeEncyclopedia() {
      shared.encyclopediaService?.terminals.dispose();
      manager.dispose();
    }
    process.once("exit", closeEncyclopedia);
    process.on("message", function parentMessage(message: unknown) {
      if (message && typeof message === "object" && "shutdown" in message && message.shutdown === true) {
        closeEncyclopedia();
        process.exit(0);
      }
    });
  }
  return shared.encyclopediaService;
}
