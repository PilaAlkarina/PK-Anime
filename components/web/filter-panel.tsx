"use client";

import { useMemo, useState } from "react";
import { Ban, Plus, Search, X } from "lucide-react";
import type { Genre, Tag } from "@/lib/anilist/types";
import { GENRE_LABELS } from "@/lib/anilist/genres";
import { POPULAR_TAGS, tagCategoryLabel } from "@/lib/anilist/tags";
import {
  COUNTRY_OPTIONS,
  cycleInclusion,
  EMPTY_FILTERS,
  FORMAT_OPTIONS,
  LENGTH_OPTIONS,
  MIN_YEAR,
  SCORE_OPTIONS,
  SEASON_OPTIONS,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  toggle,
  yearLabel,
  type CatalogFilters,
} from "@/lib/anilist/filters";
import { cn } from "@/lib/utils";

type Change = (next: CatalogFilters) => void;

const MAX_TAG_SUGGESTIONS = 8;

function Chip({
  selected,
  excluded = false,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  excluded?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={selected || excluded}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm transition-colors",
        excluded
          ? "bg-red-950 text-red-200 line-through decoration-red-300/70 ring-1 ring-red-800"
          : selected
            ? "bg-white text-black font-semibold"
            : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
      )}
    >
      {excluded && <Ban className="w-3.5 h-3.5" aria-hidden />}
      {children}
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="py-4 border-b border-zinc-900 last:border-0">
      <h3 className="text-sm font-bold text-zinc-200">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      <div className="flex flex-wrap gap-2 mt-3">{children}</div>
    </section>
  );
}

function YearSelect({ label, value, onChange }: { label: string; value: number | null; onChange: (y: number | null) => void }) {
  const years = useMemo(() => {
    const last = new Date().getFullYear() + 1;
    return Array.from({ length: last - MIN_YEAR + 1 }, (_, i) => last - i);
  }, []);
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-[7rem] text-xs text-zinc-400">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="h-10 px-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white"
      >
        <option value="">Cualquiera</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}

function TagPicker({ filters, onChange, tags }: { filters: CatalogFilters; onChange: Change; tags: Tag[] }) {
  const [text, setText] = useState("");
  const chosen = [...filters.tags, ...filters.excludeTags];
  const needle = text.trim().toLowerCase();
  const suggestions = needle
    ? tags.filter((t) => !chosen.includes(t.name) && t.name.toLowerCase().includes(needle)).slice(0, MAX_TAG_SUGGESTIONS)
    : [];
  const known = new Set(tags.map((t) => t.name));
  const popular = POPULAR_TAGS.filter((name) => !chosen.includes(name) && (tags.length === 0 || known.has(name))).slice(0, 12);

  const add = (name: string) => {
    onChange({ ...filters, tags: [...filters.tags, name] });
    setText("");
  };
  const cycle = (name: string) => {
    const { include, exclude } = cycleInclusion(filters.tags, filters.excludeTags, name);
    onChange({ ...filters, tags: include, excludeTags: exclude });
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chosen.map((name) => (
            <Chip
              key={name}
              selected={filters.tags.includes(name)}
              excluded={filters.excludeTags.includes(name)}
              onClick={() => cycle(name)}
              title="Pulsa para alternar entre incluir, excluir y quitar"
            >
              {name}
            </Chip>
          ))}
        </div>
      )}
      <div className="relative">
        <label className="flex items-center gap-2 h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 focus-within:border-zinc-500">
          <Search className="w-4 h-4" aria-hidden />
          <span className="sr-only">Buscar tag</span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions[0]) {
                e.preventDefault();
                add(suggestions[0].name);
              }
            }}
            placeholder={tags.length ? `Buscar entre ${tags.length} tags` : "Cargando tags…"}
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
        </label>
        {suggestions.length > 0 && (
          <ul className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl">
            {suggestions.map((tag) => (
              <li key={tag.name}>
                <button
                  type="button"
                  onClick={() => add(tag.name)}
                  title={tag.description}
                  className="w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-zinc-800"
                >
                  <span className="text-sm text-white">{tag.name}</span>
                  <span className="text-xs text-zinc-500">{tagCategoryLabel(tag.category)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!needle && popular.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {popular.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-dashed border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              <Plus className="w-3 h-3" aria-hidden />
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Every advanced search filter, for the sidebar on wide screens and the sheet on phones */
export function FilterPanel({
  filters,
  onChange,
  genres,
  tags,
}: {
  filters: CatalogFilters;
  onChange: Change;
  genres: Genre[];
  tags: Tag[];
}) {
  const set = (patch: Partial<CatalogFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-col">
      <section className="pb-4 border-b border-zinc-900">
        <label className="flex flex-col gap-1.5 text-sm font-bold text-zinc-200">
          Ordenar por
          <select
            value={filters.sort ?? ""}
            onChange={(e) => set({ sort: (e.target.value || null) as CatalogFilters["sort"] })}
            className="h-10 px-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-normal text-white"
          >
            <option value="">{filters.q ? "Relevancia" : "Más populares"}</option>
            {SORT_OPTIONS.filter((o) => filters.q || o.value !== "POPULARITY_DESC").map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <Section title="Formato">
        {FORMAT_OPTIONS.map((o) => (
          <Chip key={o.value} selected={filters.formats.includes(o.value)} onClick={() => set({ formats: toggle(filters.formats, o.value) })}>
            {o.label}
          </Chip>
        ))}
      </Section>

      <Section title="Estado">
        {STATUS_OPTIONS.map((o) => (
          <Chip key={o.value} selected={filters.statuses.includes(o.value)} onClick={() => set({ statuses: toggle(filters.statuses, o.value) })}>
            {o.label}
          </Chip>
        ))}
      </Section>

      <Section title="Emisión">
        <div className="flex flex-wrap gap-2 w-full">
          {SEASON_OPTIONS.map((o) => (
            <Chip key={o.value} selected={filters.season === o.value} onClick={() => set({ season: filters.season === o.value ? null : o.value })}>
              {o.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 w-full">
          <YearSelect label="Desde" value={filters.yearFrom} onChange={(yearFrom) => set({ yearFrom })} />
          <YearSelect label="Hasta" value={filters.yearTo} onChange={(yearTo) => set({ yearTo })} />
        </div>
      </Section>

      <Section title="Géneros" hint="Pulsa una vez para incluir y otra para excluir">
        {genres.map((g) => (
          <Chip
            key={g.name}
            selected={filters.genres.includes(g.name)}
            excluded={filters.excludeGenres.includes(g.name)}
            onClick={() => {
              const { include, exclude } = cycleInclusion(filters.genres, filters.excludeGenres, g.name);
              set({ genres: include, excludeGenres: exclude });
            }}
          >
            {g.label}
          </Chip>
        ))}
      </Section>

      <Section title="Tags de la comunidad" hint="Todos los elegidos deben aparecer; pulsa uno para excluirlo">
        <TagPicker filters={filters} onChange={onChange} tags={tags} />
      </Section>

      <Section title="Material original">
        {SOURCE_OPTIONS.map((o) => (
          <Chip key={o.value} selected={filters.sources.includes(o.value)} onClick={() => set({ sources: toggle(filters.sources, o.value) })}>
            {o.label}
          </Chip>
        ))}
      </Section>

      <Section title="Episodios">
        {LENGTH_OPTIONS.map((o) => (
          <Chip key={o.value} selected={filters.length === o.value} onClick={() => set({ length: filters.length === o.value ? null : o.value })}>
            {o.label}
          </Chip>
        ))}
      </Section>

      <Section title="Puntuación mínima">
        {SCORE_OPTIONS.map((score) => (
          <Chip key={score} selected={filters.minScore === score} onClick={() => set({ minScore: filters.minScore === score ? null : score })}>
            {score} %+
          </Chip>
        ))}
      </Section>

      <Section title="País de origen">
        {COUNTRY_OPTIONS.map((o) => (
          <Chip key={o.value} selected={filters.country === o.value} onClick={() => set({ country: filters.country === o.value ? null : o.value })}>
            {o.label}
          </Chip>
        ))}
      </Section>
    </div>
  );
}

const label = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((o) => o.value === value)?.label ?? value;

/** Removable chips for what is applied, above the results */
export function ActiveFilters({ filters, onChange }: { filters: CatalogFilters; onChange: Change }) {
  const items: { key: string; text: string; remove: () => CatalogFilters }[] = [];
  const add = (key: string, text: string, remove: () => CatalogFilters) => items.push({ key, text, remove });
  const without = <K extends keyof CatalogFilters>(field: K, value: unknown) => () => ({
    ...filters,
    [field]: (filters[field] as unknown[]).filter((v) => v !== value),
  });

  filters.formats.forEach((v) => add(`f-${v}`, label(FORMAT_OPTIONS, v), without("formats", v)));
  filters.statuses.forEach((v) => add(`s-${v}`, label(STATUS_OPTIONS, v), without("statuses", v)));
  if (filters.season) add("season", label(SEASON_OPTIONS, filters.season), () => ({ ...filters, season: null }));
  const years = yearLabel(filters);
  if (years) add("years", years, () => ({ ...filters, yearFrom: null, yearTo: null }));
  filters.genres.forEach((v) => add(`g-${v}`, GENRE_LABELS[v] || v, without("genres", v)));
  filters.excludeGenres.forEach((v) => add(`xg-${v}`, `Sin ${GENRE_LABELS[v] || v}`, without("excludeGenres", v)));
  filters.tags.forEach((v) => add(`t-${v}`, v, without("tags", v)));
  filters.excludeTags.forEach((v) => add(`xt-${v}`, `Sin ${v}`, without("excludeTags", v)));
  filters.sources.forEach((v) => add(`src-${v}`, label(SOURCE_OPTIONS, v), without("sources", v)));
  if (filters.length) add("length", label(LENGTH_OPTIONS, filters.length), () => ({ ...filters, length: null }));
  if (filters.minScore) add("score", `${filters.minScore} %+`, () => ({ ...filters, minScore: null }));
  if (filters.country) add("country", label(COUNTRY_OPTIONS, filters.country), () => ({ ...filters, country: null }));

  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.remove())}
          aria-label={`Quitar filtro: ${item.text}`}
          className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-zinc-800 text-xs text-zinc-100 hover:bg-zinc-700"
        >
          {item.text}
          <X className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...EMPTY_FILTERS, q: filters.q, sort: filters.sort })}
        className="h-8 px-2 text-xs font-semibold text-zinc-300 hover:text-white"
      >
        Quitar todos
      </button>
    </div>
  );
}
