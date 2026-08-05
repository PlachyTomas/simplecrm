import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type TimeOption,
  filterTimeOptions,
  formatDuration,
  formatTimeLabel,
  parseTimeInput,
} from "@/app/events/timeOptions";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";

interface TimeSelectProps {
  label: string;
  /** Local-naive `HH:MM`. */
  value: string;
  onChange: (next: string) => void;
  /** Suggestions from `buildStartOptions` / `buildEndOptions`. */
  options: TimeOption[];
  /** `testIds.events.timeStart` / `timeEnd`. */
  testId: string;
  /** The modal's shared input classes, so both fields sit on the same grid. */
  inputCls: string;
}

/**
 * Google-Calendar-style time combobox: a plain text field the user can type
 * into loosely (`9`, `9.30`, `1415`) backed by a quarter-hour suggestion
 * list. Typing narrows the list; blur/Enter commits the loose parse and
 * silently reverts when the text isn't a time, so the field can never end up
 * empty and block the form.
 *
 * The listbox is an absolutely-positioned sibling inside the dialog DOM (no
 * portal) — `useModalDialog`'s focus trap must keep seeing it.
 */
export function TimeSelect({ label, value, onChange, options, testId, inputCls }: TimeSelectProps) {
  const { t } = useTranslation("deals");
  const locale = useLocale();
  const inputId = useId();
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const [text, setText] = useState(() => formatTimeLabel(value, locale));
  const [open, setOpen] = useState(false);
  // Only a user-typed query narrows the list; a freshly opened field shows
  // the whole day (its formatted value would otherwise filter down to one).
  const [typing, setTyping] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Re-sync whenever the value moves from outside: the prefill, a language
  // switch, or the start dragging the end along.
  useEffect(() => {
    setText(formatTimeLabel(value, locale));
  }, [value, locale]);

  const visible = typing ? filterTimeOptions(options, text) : options;
  const showList = open && visible.length > 0;
  const activeId =
    activeIndex >= 0 && visible[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  // Keep the highlighted row in view while arrowing through 96 options.
  useEffect(() => {
    if (!showList || activeIndex < 0) return;
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView?.({ block: "nearest" });
  }, [showList, activeIndex]);

  function openList() {
    setTyping(false);
    setOpen(true);
    const at = options.findIndex((option) => option.value === value);
    setActiveIndex(at);
  }

  function commit(raw: string) {
    const parsed = parseTimeInput(raw);
    if (parsed) {
      onChange(parsed);
      setText(formatTimeLabel(parsed, locale));
    } else {
      setText(formatTimeLabel(value, locale));
    }
    setTyping(false);
  }

  function select(option: TimeOption) {
    onChange(option.value);
    setText(formatTimeLabel(option.value, locale));
    setTyping(false);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((prev) => {
        const next = prev + step;
        if (next < 0) return 0;
        if (next > visible.length - 1) return visible.length - 1;
        return next;
      });
      return;
    }
    if (e.key === "Enter") {
      // Never let the picker submit the form — Enter is "take this time".
      e.preventDefault();
      const picked = showList && activeIndex >= 0 ? visible[activeIndex] : undefined;
      if (picked) {
        select(picked);
      } else {
        commit(text);
        setOpen(false);
      }
      return;
    }
    if (e.key === "Escape" && open) {
      // Close the list only; the modal's own Escape handler stays for the
      // second press.
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative block text-sm">
      <label htmlFor={inputId} className="mb-1 block text-text-secondary">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        data-testid={testId}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setTyping(true);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={openList}
        onClick={() => {
          if (!open) openList();
        }}
        onBlur={() => {
          commit(text);
          setOpen(false);
        }}
        onKeyDown={handleKeyDown}
        className={inputCls}
      />
      {showList ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={t("eventFormModal.timePicker.optionsLabel")}
          className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-surface-elevated py-1 shadow-md"
        >
          {visible.map((option, index) => (
            <button
              key={option.value}
              type="button"
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-testid={testIds.events.timeOption(option.value)}
              // Keep focus in the input so blur-commit doesn't race the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(option)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-fast ${
                index === activeIndex
                  ? "bg-surface-overlay text-text-primary"
                  : "text-text-secondary"
              }`}
            >
              <span className="tabular-nums">{formatTimeLabel(option.value, locale)}</span>
              {option.durationMinutes ? (
                <span className="whitespace-nowrap text-xs text-text-tertiary">
                  {formatDuration(option.durationMinutes, locale)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
