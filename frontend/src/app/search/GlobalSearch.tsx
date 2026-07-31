import { Building2, HandCoins, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { MIN_SEARCH_LENGTH, type SearchHit, useGlobalSearch } from "@/app/search/useGlobalSearch";
import { FOCUS_SEARCH_EVENT } from "@/lib/shortcuts";
import { testIds } from "@/lib/testids";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { cn } from "@/lib/utils";

type EntityKind = "companies" | "contacts" | "deals";

const GROUP_ICON = {
  companies: Building2,
  contacts: Users,
  deals: HandCoins,
} as const;

/** Where clicking a hit lands. Deals have no standalone page — the list route
 * opens the detail dialog off a `deal` query param (see `useDealDialog`). */
function hrefFor(kind: EntityKind, id: string): string {
  if (kind === "companies") return `/app/companies/${id}`;
  if (kind === "contacts") return `/app/contacts/${id}`;
  return `/app/deals?deal=${id}`;
}

const LISTBOX_ID = "global-search-listbox";

/**
 * Top-bar search across companies, contacts and deals.
 *
 * Debounced 250ms, held until `MIN_SEARCH_LENGTH` characters so a stray
 * keystroke never queries the org. On <md the field collapses behind an icon
 * so it can't crowd the org name out of the mobile header; expanding it lays
 * the field over the header row rather than reflowing it.
 */
export function GlobalSearch() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debounced = useDebouncedValue(term, 250);
  const { data, isFetching } = useGlobalSearch(debounced);

  // One flat list behind the grouped rendering — arrow keys walk across group
  // boundaries, so the index has to be global, not per-group.
  const flat = useMemo(() => {
    const kinds: EntityKind[] = ["companies", "contacts", "deals"];
    return kinds.flatMap((kind) => (data?.[kind] ?? []).map((hit: SearchHit) => ({ kind, hit })));
  }, [data]);

  // A new result set invalidates whatever row was highlighted.
  useEffect(() => {
    setActiveIndex(-1);
  }, [flat]);

  // ⌘K / "/" from the global shortcut layer — jump into the field. On
  // small screens the input mounts only after the toggle flips.
  useEffect(() => {
    const onFocusRequest = () => {
      setMobileOpen(true);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusRequest);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusRequest);
  }, []);

  // Any click outside dismisses the dropdown (and re-collapses the mobile
  // field), matching every other popover in the app.
  useEffect(() => {
    if (!focused && !mobileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setFocused(false);
      setMobileOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [focused, mobileOpen]);

  const queryReady = debounced.trim().length >= MIN_SEARCH_LENGTH;
  const showPanel = focused && queryReady;
  const showEmpty = showPanel && flat.length === 0 && !isFetching;

  const select = (kind: EntityKind, id: string) => {
    setTerm("");
    setFocused(false);
    setMobileOpen(false);
    inputRef.current?.blur();
    navigate(hrefFor(kind, id));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setFocused(false);
      setMobileOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!showPanel || flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Enter with nothing highlighted takes the first hit — the common case
      // is "type enough, hit Enter".
      const target = flat[activeIndex >= 0 ? activeIndex : 0];
      if (target) select(target.kind, target.hit.id);
    }
  };

  // Rendering walks the groups (for headers) but numbers rows off the flat
  // list so `activeIndex` lines up with what the arrow keys moved.
  let cursor = -1;

  return (
    // `relative` only from md up — that's deliberate. On mobile this container
    // is just the 32px icon button, and anchoring a 22rem dropdown to its right
    // edge pushes it off the left of the viewport. Staying unpositioned lets
    // the overlay resolve against the sticky <header> instead, which spans the
    // full width and gives the field and panel something sane to inset from.
    <div ref={containerRef} className="md:relative">
      <button
        type="button"
        data-testid={testIds.search.mobileToggle}
        aria-label={t("search.label")}
        aria-expanded={mobileOpen}
        onClick={() => {
          setMobileOpen(true);
          // The input only exists after the state flush on small screens.
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary md:hidden",
          mobileOpen && "hidden",
        )}
      >
        <Search size={16} strokeWidth={1.75} aria-hidden />
      </button>

      <div
        className={cn(
          // Collapsed on mobile; the expanded field overlays the header row
          // instead of reflowing it (which would push the avatar off-screen).
          "md:static md:block md:translate-y-0",
          mobileOpen ? "absolute inset-x-3 top-1/2 z-40 -translate-y-1/2" : "hidden",
        )}
      >
        <label className="relative block">
          <span className="sr-only">{t("search.label")}</span>
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `global-search-option-${activeIndex}` : undefined
            }
            data-testid={testIds.search.input}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={onKeyDown}
            placeholder={t("search.placeholder")}
            className="h-9 w-full rounded-md border border-border bg-surface-overlay pl-9 pr-8 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none md:w-64 lg:w-80"
          />
          {mobileOpen ? (
            <button
              type="button"
              aria-label={t("search.close")}
              onClick={() => {
                setTerm("");
                setMobileOpen(false);
                setFocused(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary md:hidden"
            >
              <X size={14} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
        </label>
      </div>

      {showPanel ? (
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label={t("search.resultsLabel")}
          data-testid={testIds.search.panel}
          // Mobile: inset from both viewport edges (offset parent is the
          // header). Desktop: right-aligned under the input.
          className="absolute inset-x-3 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl md:inset-x-auto md:right-0 md:w-[22rem]"
        >
          {showEmpty ? (
            <p className="px-3 py-4 text-sm text-text-tertiary">{t("search.noResults")}</p>
          ) : (
            (["companies", "contacts", "deals"] as EntityKind[]).map((kind) => {
              const hits = data?.[kind] ?? [];
              if (hits.length === 0) return null;
              const Icon = GROUP_ICON[kind];
              return (
                <div key={kind} className="py-1">
                  <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                    {t(`search.groups.${kind}`)}
                  </p>
                  <ul role="presentation">
                    {hits.map((hit: SearchHit) => {
                      cursor += 1;
                      const index = cursor;
                      return (
                        <li key={hit.id} role="presentation">
                          <button
                            type="button"
                            id={`global-search-option-${index}`}
                            role="option"
                            aria-selected={index === activeIndex}
                            data-testid={testIds.search.option(hit.id)}
                            // Fires before the input's blur so the click isn't
                            // swallowed by the dropdown unmounting.
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => select(kind, hit.id)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors duration-fast",
                              index === activeIndex
                                ? "bg-accent-subtle text-accent"
                                : "text-text-primary hover:bg-surface-overlay",
                            )}
                          >
                            <Icon
                              size={16}
                              strokeWidth={1.75}
                              aria-hidden
                              className="shrink-0 text-text-tertiary"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{hit.name}</span>
                              {hit.subtitle ? (
                                <span className="block truncate text-xs text-text-tertiary">
                                  {hit.subtitle}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
