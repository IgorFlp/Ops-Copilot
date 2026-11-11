import {
  STRATEGY_SELECTIONS,
  type StrategySelection,
} from "../../hooks/useStrategy";

const LABELS: Record<StrategySelection, string> = {
  auto: "Automático (roteador)",
  react: "ReAct",
  "plan-and-execute": "Plano e execução",
  "reflect:react": "ReAct com reflexão",
  team: "Equipe (supervisor + papéis)",
};

export interface StrategySelectProps {
  value: StrategySelection;
  onChange(value: StrategySelection): void;
  disabled?: boolean;
}

export function StrategySelect({
  value,
  onChange,
  disabled = false,
}: StrategySelectProps) {
  return (
    <div className="field composer__strategy">
      <label className="field__label" htmlFor="strategy-select">
        Rota de raciocínio
      </label>
      <select
        id="strategy-select"
        className="field__control"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value as StrategySelection)
        }
      >
        {STRATEGY_SELECTIONS.map((option) => (
          <option key={option} value={option}>
            {LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
