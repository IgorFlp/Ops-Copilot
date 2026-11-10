import { useState, type KeyboardEvent } from "react";
import { Button } from "../ui/Button";
import { SendIcon } from "../ui/icons";
import { TextField } from "../ui/TextField";

export interface ChatComposerProps {
  onSend(message: string): void;
  disabled?: boolean;
}

export function ChatComposer({ onSend, disabled = false }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [validation, setValidation] = useState<string | undefined>(undefined);

  function submit(): void {
    if (value.trim().length === 0) {
      setValidation("Digite uma mensagem antes de enviar.");
      return;
    }
    setValidation(undefined);
    onSend(value);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) submit();
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TextField
        id="chat-message"
        label="Mensagem"
        rows={3}
        className="composer__input"
        placeholder="Pergunte sobre alertas e incidentes"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        error={validation}
        disabled={disabled}
      />
      <div className="composer__row">
        <Button type="submit" disabled={disabled} aria-label="Enviar mensagem">
          <SendIcon />
          Enviar
        </Button>
      </div>
    </form>
  );
}
