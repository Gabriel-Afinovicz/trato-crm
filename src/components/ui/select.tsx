"use client";

import {
  type SelectHTMLAttributes,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HelpIcon } from "./help-icon";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  /** Quando preenchido, mostra um icone "?" ao lado do label com a explicacao. */
  tooltip?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      tooltip,
      error,
      options,
      placeholder,
      className = "",
      id,
      value,
      defaultValue,
      onChange,
      disabled,
      containerClassName = "",
      ...props
    },
    ref
  ) => {
    const isControlled = value !== undefined;
    const [localValue, setLocalValue] = useState<string | number | readonly string[]>(
      defaultValue || ""
    );
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(-1);

    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const activeValue = isControlled ? (value as string) : (localValue as string);
    const selectId = id || label?.toLowerCase().replace(/\s/g, "-");

    // Close when clicking outside
    useEffect(() => {
      if (!open) return;
      function handleClickOutside(e: MouseEvent) {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
          setSearchQuery("");
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [open]);

    // Focus search input when dropdown opens
    useEffect(() => {
      if (open) {
        setTimeout(() => {
          searchInputRef.current?.focus();
          setActiveIndex(-1);
        }, 50);
      }
    }, [open]);

    const filteredOptions = useMemo(() => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return options;
      return options.filter((opt) => opt.label.toLowerCase().includes(q));
    }, [options, searchQuery]);

    const selectedOption = useMemo(() => {
      return options.find((opt) => opt.value === activeValue);
    }, [options, activeValue]);

    const displayLabel = useMemo(() => {
      if (selectedOption) return selectedOption.label;
      if (placeholder) return placeholder;
      if (options.length > 0) return options[0].label;
      return "";
    }, [selectedOption, placeholder, options]);

    const handleSelect = (val: string) => {
      if (!isControlled) {
        setLocalValue(val);
      }
      setOpen(false);
      setSearchQuery("");

      if (onChange) {
        let mutatedVal = val;
        const targetObj = {
          value: val,
          name: props.name || "",
        };

        // Define getter/setter for target.value to catch direct mutations like e.target.value = ""
        Object.defineProperty(targetObj, "value", {
          get() {
            return mutatedVal;
          },
          set(newVal) {
            mutatedVal = newVal;
            if (!isControlled) {
              setLocalValue(newVal);
            }
          },
          configurable: true,
          enumerable: true,
        });

        const simulatedEvent = {
          target: targetObj,
          currentTarget: targetObj,
          preventDefault() {},
          stopPropagation() {},
          nativeEvent: new Event("change"),
        } as unknown as React.ChangeEvent<HTMLSelectElement>;

        onChange(simulatedEvent);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;

      if (!open) {
        if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setSearchQuery("");
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) =>
          filteredOptions.length > 0 ? (prev + 1) % filteredOptions.length : -1
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          filteredOptions.length > 0
            ? (prev - 1 + filteredOptions.length) % filteredOptions.length
            : -1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
          handleSelect(filteredOptions[activeIndex].value);
          triggerRef.current?.focus();
        } else if (filteredOptions.length === 1) {
          handleSelect(filteredOptions[0].value);
          triggerRef.current?.focus();
        }
      }
    };

    return (
      <div className={`space-y-1 ${containerClassName}`} ref={containerRef}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {tooltip && <HelpIcon>{tooltip}</HelpIcon>}
          </label>
        )}

        <div className="relative">
          <button
            ref={triggerRef}
            id={selectId}
            type="button"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={handleKeyDown}
            className={`flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-500
              ${error ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : ""}
              ${open ? "ring-2 ring-blue-500/20 border-blue-500" : ""}
              ${className}`}
          >
            <span
              className={`truncate ${
                selectedOption ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {displayLabel}
            </span>
            <svg
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                open ? "rotate-180" : ""
              }`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.24 4.38a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* Hidden native select for form compatibility */}
          <select
            ref={ref}
            value={activeValue}
            onChange={onChange}
            disabled={disabled}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            {...props}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {open && (
            <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="p-2 border-b border-gray-100 flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-gray-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z"
                  />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar..."
                  className="w-full text-sm border-0 focus:outline-none focus:ring-0 p-0 text-gray-900"
                />
              </div>

              <ul className="max-h-60 overflow-y-auto py-1">
                {filteredOptions.length === 0 && (
                  <li className="px-3 py-2 text-sm text-gray-450 text-center">
                    Nenhum resultado encontrado
                  </li>
                )}
                {filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === activeValue;
                  const isActive = idx === activeIndex;
                  return (
                    <li
                      key={opt.value}
                      className={`group flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer select-none
                        ${isSelected ? "bg-blue-50/60 font-medium text-blue-700" : "text-gray-800"}
                        ${isActive ? "bg-gray-100" : "hover:bg-gray-50"}`}
                      onClick={() => handleSelect(opt.value)}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <svg
                          className="h-4 w-4 shrink-0 text-blue-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-650">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
