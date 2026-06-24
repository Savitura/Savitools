'use client';

import { OperationManifestEntry } from '@/lib/composer-api';
import { useEffect, useState } from 'react';
import { ComposedOperation } from './index';

interface OperationFormProps {
  operation: ComposedOperation | null;
  manifest: OperationManifestEntry[];
  onChange: (id: string, fields: Record<string, unknown>) => void;
}

export function OperationForm({ operation, manifest, onChange }: OperationFormProps) {
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Reset touched state when the selected operation changes
  useEffect(() => {
    setTouched(new Set());
  }, [operation?.id]);

  if (!operation) {
    return (
      <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-border/60 text-center px-4">
        <p className="text-xs text-muted-foreground">
          Select an operation to edit its fields
        </p>
      </div>
    );
  }

  const schema = manifest.find((m) => m.type === operation.type);
  if (!schema) return null;

  const handleChange = (fieldName: string, value: string | boolean) => {
    const parts = fieldName.split('.');
    const next = { ...operation.fields };

    if (parts.length === 1) {
      next[fieldName] = value;
    } else {
      const [parent, child] = parts;
      const parentObj = (next[parent] as Record<string, unknown>) ?? {};
      next[parent] = { ...parentObj, [child]: value };
    }

    onChange(operation.id, next);
  };

  const handleBlur = (fieldName: string) => {
    setTouched((prev) => new Set(prev).add(fieldName));
  };

  const getValue = (fieldName: string): string => {
    const parts = fieldName.split('.');
    if (parts.length === 1) return String(operation.fields[fieldName] ?? '');
    const [parent, child] = parts;
    const parentObj = operation.fields[parent] as Record<string, unknown> | undefined;
    return String(parentObj?.[child] ?? '');
  };

  const hasError = (fieldName: string, required: boolean): boolean => {
    return required && touched.has(fieldName) && getValue(fieldName).trim() === '';
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 pb-3 border-b border-border/60">
        <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
        <p className="text-xs font-semibold text-foreground/80 capitalize">
          {operation.type.replace(/_/g, ' ')}
        </p>
      </div>

      {schema.fields.map((field) => {
        const error = hasError(field.name, field.required);

        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label
              htmlFor={`field-${operation.id}-${field.name}`}
              className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {field.label}
              {field.required && (
                <span className="text-rose-400 text-[10px]">*</span>
              )}
            </label>

            {field.type === 'boolean' ? (
              <div className="flex items-center gap-3">
                {['true', 'false'].map((opt) => (
                  <label
                    key={opt}
                    htmlFor={`field-${operation.id}-${field.name}-${opt}`}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs cursor-pointer transition-all
                      ${getValue(field.name) === opt
                        ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                        : 'border-border bg-card text-muted-foreground hover:border-border/80'
                      }`}
                  >
                    <input
                      id={`field-${operation.id}-${field.name}-${opt}`}
                      type="radio"
                      name={`${operation.id}-${field.name}`}
                      value={opt}
                      checked={getValue(field.name) === opt}
                      onChange={() => handleChange(field.name, opt === 'true')}
                      className="sr-only"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : (
              <input
                id={`field-${operation.id}-${field.name}`}
                type="text"
                inputMode={field.type === 'number' ? 'decimal' : 'text'}
                value={getValue(field.name)}
                onChange={(e) => handleChange(field.name, e.target.value)}
                onBlur={() => handleBlur(field.name)}
                placeholder={field.placeholder}
                required={field.required}
                aria-invalid={error}
                className={`w-full rounded-md border bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 transition-colors ${
                  error
                    ? 'border-rose-500/60 focus:ring-rose-500/40 focus:border-rose-500/60'
                    : 'border-border focus:ring-violet-500/50 focus:border-violet-500/50'
                }`}
              />
            )}

            {error && (
              <p className="text-[10px] text-rose-400">{field.label} is required</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
