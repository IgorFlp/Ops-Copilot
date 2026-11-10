import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { TextField } from "../ui/TextField";

export interface SettingsPanelProps {
  open: boolean;
  baseUrl: string;
  onClose(): void;
  onSave(url: string): { ok: boolean; error?: string };
}

export function SettingsPanel({
  open,
  baseUrl,
  onClose,
  onSave,
}: SettingsPanelProps) {
  const [value, setValue] = useState(baseUrl);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setValue(baseUrl);
      setError(undefined);
    }
  }, [open, baseUrl]);

  function handleSave(): void {
    const result = onSave(value);
    if (result.ok) {
      onClose();
      return;
    }
    setError(result.error ?? "URL inválida.");
  }

  return (
    <Dialog
      open={open}
      title="Configurações"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </>
      }
    >
      <TextField
        id="api-base-url"
        label="URL da API"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
        placeholder="http://localhost:3000"
      />
      <p className="settings__hint">
        Endereço base da API do OpsCopilot, por exemplo
        http://localhost:3000.
      </p>
    </Dialog>
  );
}
