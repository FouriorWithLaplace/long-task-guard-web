export interface ModelSelection {
  model: string;
  reasoning: string;
}

export const encyclopediaDefaultModel: ModelSelection = {
  model: "gpt-6-astra",
  reasoning: "medium",
};

export interface ReasoningOption {
  value: string;
  description: string;
}

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  reasoningEfforts: ReasoningOption[];
  defaultReasoningEffort: string;
  isDefault: boolean;
}

export interface ModelCatalog {
  version: 1;
  updatedAt: string | null;
  models: ModelOption[];
}
