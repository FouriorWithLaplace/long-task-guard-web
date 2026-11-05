import path from "node:path";

export interface EncyclopediaPaths {
  workspace: string;
  database: string;
  dataRoot: string;
}

export const paths: EncyclopediaPaths = {
  workspace: "C:/Users/laplace/Desktop/encyclopedia-agent",
  database:
    "C:/Users/laplace/Desktop/FusionNexus/portal/data/encyclopedia-workspace/encyclopedia.db",
  dataRoot: "C:/Users/laplace/Desktop/FusionNexus/portal/data",
};

export function panelDirectory(config: EncyclopediaPaths) {
  return path.join(config.workspace, "panel");
}
