"use client";

import { Ban, Check } from "lucide-react";
import type { Genre } from "@/lib/anilist/types";
import { POPULAR_TAGS } from "@/lib/anilist/tags";
import {
  COUNTRY_OPTIONS,
  cycleInclusion,
  EMPTY_FILTERS,
  FORMAT_OPTIONS,
  LENGTH_OPTIONS,
  SCORE_OPTIONS,
  SEASON_OPTIONS,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  toggle,
  type CatalogFilters,
} from "@/lib/anilist/filters";
import { FocusButton, FocusGroup } from "./focusable";
import { useRevealOnFocus } from "./page-frame";

type Change = (next: CatalogFilters) => void;

/** Year ranges as single presses; typing years with a remote is slow */
function yearRanges(now = new Date().getFullYear()) {
  return [
    { label: `${now}`, from: now, to: now },
    { label: `${now - 1}`, from: now - 1, to: now - 1 },
    { label: "2020s", from: 2020, to: 2029 },
    { label: "2010s", from: 2010, to: 2019 },
    { label: "2000s", from: 2000, to: 2009 },
    { label: "1990s", from: 1990, to: 1999 },
    { label: "Antes de 1990", from: null, to: 1989 },
  ];
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const reveal = useRevealOnFocus(120);
  return (
    <div className="mb-8">
      <h3 className="text-xl font-bold text-zinc-200">{title}</h3>
      {hint && <p className="mt-1 text-base text-zinc-500">{hint}</p>}
      <FocusGroup className="flex flex-wrap mt-3 -mb-2" onFocusInside={(node) => reveal(node)}>
        {children}
      </FocusGroup>
    </div>
  );
}

function Option({
  selected,
  excluded = false,
  onSelect,
  children,
}: {
  selected: boolean;
  excluded?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <FocusButton variant="chip" className="mr-2 mb-2" active={selected || excluded} onSelect={onSelect}>
      {excluded ? <Ban className="w-5 h-5 mr-2" /> : selected && <Check className="w-5 h-5 mr-2" />}
      {excluded ? <span className="line-through">{children}</span> : children}
    </FocusButton>
  );
}

/** Advanced search filters for the remote: every value is one press away */
export function TvFilterPanel({ filters, onChange, genres }: { filters: CatalogFilters; onChange: Change; genres: Genre[] }) {
  const set = (patch: Partial<CatalogFilters>) => onChange({ ...filters, ...patch });
  const tags = Array.from(new Set([...filters.tags, ...filters.excludeTags, ...POPULAR_TAGS]));

  return (
    <div>
      <Group title="Ordenar por">
        <Option selected={filters.sort === null} onSelect={() => set({ sort: null })}>
          {filters.q ? "Relevancia" : "Más populares"}
        </Option>
        {SORT_OPTIONS.filter((o) => filters.q || o.value !== "POPULARITY_DESC").map((o) => (
          <Option key={o.value} selected={filters.sort === o.value} onSelect={() => set({ sort: o.value })}>
            {o.label}
          </Option>
        ))}
      </Group>

      <Group title="Formato">
        {FORMAT_OPTIONS.map((o) => (
          <Option key={o.value} selected={filters.formats.includes(o.value)} onSelect={() => set({ formats: toggle(filters.formats, o.value) })}>
            {o.label}
          </Option>
        ))}
      </Group>

      <Group title="Estado">
        {STATUS_OPTIONS.map((o) => (
          <Option key={o.value} selected={filters.statuses.includes(o.value)} onSelect={() => set({ statuses: toggle(filters.statuses, o.value) })}>
            {o.label}
          </Option>
        ))}
      </Group>

      <Group title="Temporada">
        {SEASON_OPTIONS.map((o) => (
          <Option key={o.value} selected={filters.season === o.value} onSelect={() => set({ season: filters.season === o.value ? null : o.value })}>
            {o.label}
          </Option>
        ))}
      </Group>

      <Group title="Año de estreno">
        {yearRanges().map((r) => {
          const selected = filters.yearFrom === r.from && filters.yearTo === r.to;
          return (
            <Option
              key={r.label}
              selected={selected}
              onSelect={() => set(selected ? { yearFrom: null, yearTo: null } : { yearFrom: r.from, yearTo: r.to })}
            >
              {r.label}
            </Option>
          );
        })}
      </Group>

      <Group title="Géneros" hint="Una pulsación incluye, otra excluye y la tercera quita">
        {genres.map((g) => (
          <Option
            key={g.name}
            selected={filters.genres.includes(g.name)}
            excluded={filters.excludeGenres.includes(g.name)}
            onSelect={() => {
              const { include, exclude } = cycleInclusion(filters.genres, filters.excludeGenres, g.name);
              set({ genres: include, excludeGenres: exclude });
            }}
          >
            {g.label}
          </Option>
        ))}
      </Group>

      <Group title="Tags de la comunidad" hint="Los más habituales; desde el ordenador o el móvil se puede elegir cualquiera">
        {tags.map((name) => (
          <Option
            key={name}
            selected={filters.tags.includes(name)}
            excluded={filters.excludeTags.includes(name)}
            onSelect={() => {
              const { include, exclude } = cycleInclusion(filters.tags, filters.excludeTags, name);
              set({ tags: include, excludeTags: exclude });
            }}
          >
            {name}
          </Option>
        ))}
      </Group>

      <Group title="Material original">
        {SOURCE_OPTIONS.map((o) => (
          <Option key={o.value} selected={filters.sources.includes(o.value)} onSelect={() => set({ sources: toggle(filters.sources, o.value) })}>
            {o.label}
          </Option>
        ))}
      </Group>

      <Group title="Episodios">
        {LENGTH_OPTIONS.map((o) => (
          <Option key={o.value} selected={filters.length === o.value} onSelect={() => set({ length: filters.length === o.value ? null : o.value })}>
            {o.label}
          </Option>
        ))}
      </Group>

      <Group title="Puntuación mínima">
        {SCORE_OPTIONS.map((score) => (
          <Option key={score} selected={filters.minScore === score} onSelect={() => set({ minScore: filters.minScore === score ? null : score })}>
            {score} %+
          </Option>
        ))}
      </Group>

      <Group title="País de origen">
        {COUNTRY_OPTIONS.map((o) => (
          <Option key={o.value} selected={filters.country === o.value} onSelect={() => set({ country: filters.country === o.value ? null : o.value })}>
            {o.label}
          </Option>
        ))}
      </Group>

      <FocusGroup>
        <FocusButton onSelect={() => onChange({ ...EMPTY_FILTERS, q: filters.q })}>Quitar todos los filtros</FocusButton>
      </FocusGroup>
    </div>
  );
}
