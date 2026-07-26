"use client";

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="control">
        <input
          type={type}
          required={required}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="control">
        {prefix && <b>{prefix}</b>}
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <b>{suffix}</b>}
      </span>
    </label>
  );
}

/** Percentage input: stores a 0–1 rate, displays and edits as a percentage. */
export function RateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberInput
      label={label}
      value={Number((value * 100).toFixed(4))}
      suffix="%"
      step="0.1"
      onChange={(next) => onChange(next / 100)}
    />
  );
}
