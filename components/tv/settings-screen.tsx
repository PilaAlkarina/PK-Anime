"use client";

import { doesFocusableExist, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { ArrowDown, ArrowUp, Check, Plus, X } from "lucide-react";
import type { SubtitleStyles } from "@/components/player/subtitle-settings-dialog";
import { SUBTITLE_LANGUAGES, subtitleLanguageName } from "@/components/player/player-core/subtitle-language";
import { subtitleFontFamily, subtitleOutlineStyles } from "@/components/player/player-core/subtitle-style";
import {
  resetPlaybackPreferences,
  updatePlaybackPreferences,
  usePlaybackPreferences,
  type PlaybackPreferences,
} from "@/lib/playback-preferences";
import { THEMES } from "@/lib/themes";
import { setThemePreference, useThemePreference } from "@/lib/theme-preference";
import { useUiMode } from "@/components/ui-mode";
import type { UiMode } from "@/lib/ui-mode";
import { FocusButton, FocusGroup } from "./focusable";
import { switchUiMode } from "./tv-link";
import { PageFrame, useMounted, useRevealOnFocus } from "./page-frame";

interface Option<T> {
  value: T;
  label: string;
  swatch?: string;
}

const AUDIO_OPTIONS: Option<PlaybackPreferences["audio"]>[] = [
  { value: "sub", label: "Original con subtítulos" },
  { value: "dub", label: "Doblaje en inglés" },
];

const ON_OFF: Option<boolean>[] = [
  { value: true, label: "Sí" },
  { value: false, label: "No" },
];

const DUB_SUBTITLE_OPTIONS: Option<PlaybackPreferences["dubSubtitles"]>[] = [
  { value: "full", label: "Completos" },
  { value: "forced", label: "Solo carteles y canciones" },
  { value: "off", label: "Ninguno" },
];

const SERVER_OPTIONS: Option<PlaybackPreferences["preferredServer"]>[] = [
  { value: "auto", label: "Automático" },
  { value: "flow", label: "Flow" },
  { value: "kitty", label: "Kitty" },
  { value: "buzz", label: "Buzz" },
  { value: "yuri", label: "Yuri" },
  { value: "zuri", label: "Zuri" },
];

const SIZE_OPTIONS: Option<SubtitleStyles["fontSize"]>[] = [
  { value: "sm", label: "Pequeño" },
  { value: "base", label: "Mediano" },
  { value: "lg", label: "Grande" },
  { value: "xl", label: "Muy grande" },
  { value: "2xl", label: "Enorme" },
];

const FONT_OPTIONS: Option<NonNullable<SubtitleStyles["fontFamily"]>>[] = [
  { value: "sans", label: "Moderna" },
  { value: "anime", label: "Anime" },
  { value: "mono", label: "Monoespaciada" },
  { value: "serif", label: "Clásica" },
];

const WEIGHT_OPTIONS: Option<NonNullable<SubtitleStyles["fontWeight"]>>[] = [
  { value: "normal", label: "Normal" },
  { value: "bold", label: "Negrita" },
];

const COLOR_OPTIONS: Option<string>[] = [
  { value: "#ffffff", label: "Blanco", swatch: "#ffffff" },
  { value: "#facc15", label: "Amarillo", swatch: "#facc15" },
  { value: "#38bdf8", label: "Cian", swatch: "#38bdf8" },
  { value: "#4ade80", label: "Lima", swatch: "#4ade80" },
  { value: "#f472b6", label: "Rosa", swatch: "#f472b6" },
];

// Same values the player's own styling dialog writes
const BACKGROUND_OPTIONS: Option<string>[] = [
  { value: "transparent", label: "Sin fondo" },
  { value: "rgba(0, 0, 0, 0.4)", label: "Translúcido" },
  { value: "rgba(0, 0, 0, 0.85)", label: "Sólido" },
];

const OUTLINE_OPTIONS: Option<NonNullable<SubtitleStyles["outline"]>>[] = [
  { value: "none", label: "Sin contorno" },
  { value: "thin", label: "Fino" },
  { value: "thick", label: "Grueso" },
];

// Player overlay sizes, so the preview matches what plays
const SIZE_PX: Record<SubtitleStyles["fontSize"], number> = { sm: 15, base: 19, lg: 25, xl: 32, "2xl": 38 };

/** Moves focus once the focused button has been replaced (a language added or removed) */
function focusSoon(...keys: string[]) {
  setTimeout(() => {
    const key = keys.find((k) => doesFocusableExist(k));
    if (key) setFocus(key);
  }, 0);
}

/*
 * On computers each setting is a row, the label and its hint on the left and the choices on the
 * right, with the section's name in a column of its own; phones and the TV stack them.
 */
function Setting({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 md:mb-0 md:py-5 md:grid md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:gap-x-10 tv:block tv:mb-10 tv:py-0">
      <div>
        <h3 className="text-base font-bold tv:text-2xl">{label}</h3>
        {hint && <p className="mt-1 max-w-[60rem] text-sm text-zinc-400 leading-snug tv:mt-2 tv:text-lg">{hint}</p>}
      </div>
      <div className="mt-3 md:mt-0 tv:mt-4">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12 md:mb-10 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-x-10 tv:block tv:mb-16">
      <h2 className="mb-6 pb-2 text-sm font-bold uppercase tracking-widest text-zinc-500 border-b border-white/10 md:mb-0 md:pt-5 md:pb-0 md:border-b-0 md:self-start md:sticky md:top-20 tv:static tv:mb-8 tv:pb-3 tv:pt-0 tv:text-lg tv:border-b">
        {title}
      </h2>
      <div className="md:border-t md:border-white/10 md:divide-y md:divide-white/10 tv:border-t-0 tv:divide-y-0">{children}</div>
    </section>
  );
}

function Options<T>({ value, options, onChange }: { value: T; options: Option<T>[]; onChange: (value: T) => void }) {
  const reveal = useRevealOnFocus(160);
  return (
    <FocusGroup className="flex flex-wrap -mb-2 tv:-mb-3" onFocusInside={(node) => reveal(node)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <FocusButton key={String(option.value)} variant="chip" className="mr-2 mb-2 tv:mr-3 tv:mb-3" active={selected} onSelect={() => onChange(option.value)}>
            {option.swatch && (
              <span className="w-4 h-4 mr-2 rounded-full tv:w-5 tv:h-5 tv:mr-3 ring-2 ring-black/30" style={{ background: option.swatch }} />
            )}
            {selected && !option.swatch && <Check className="w-4 h-4 mr-1.5 tv:w-5 tv:h-5 tv:mr-2" />}
            {option.label}
          </FocusButton>
        );
      })}
    </FocusGroup>
  );
}

function LanguageList({ languages }: { languages: string[] }) {
  const reveal = useRevealOnFocus(160);
  const set = (subtitleLanguages: string[]) => updatePlaybackPreferences({ subtitleLanguages });
  const move = (index: number, by: number) => {
    const next = [...languages];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    set(next);
  };
  const remove = (index: number) => {
    const neighbour = languages[index + 1] || languages[index - 1];
    set(languages.filter((_, i) => i !== index));
    focusSoon(`lang-remove-${neighbour}`, "lang-add-first");
  };
  const add = (code: string, index: number) => {
    const rest = SUBTITLE_LANGUAGES.filter((l) => !languages.includes(l.code) && l.code !== code);
    set([...languages, code]);
    focusSoon(`lang-add-${rest[index]?.code || rest[rest.length - 1]?.code}`, `lang-remove-${code}`);
  };
  const available = SUBTITLE_LANGUAGES.filter((l) => !languages.includes(l.code));

  return (
    <>
      {languages.length === 0 ? (
        <p className="mb-6 text-base text-zinc-400 tv:text-xl">
          Sin idiomas elegidos: se usa la pista predeterminada de cada servidor.
        </p>
      ) : (
        <FocusGroup className="mb-6 max-w-[52rem] space-y-3" onFocusInside={(node) => reveal(node)}>
          {languages.map((code, index) => (
            <div key={code} className="flex items-center h-14 pl-4 pr-1.5 rounded-xl bg-white/5 tv:h-16 tv:pl-6 tv:pr-2 tv:rounded-2xl">
              <span className="w-7 text-base font-bold text-zinc-500 tv:w-10 tv:text-xl">{index + 1}</span>
              <span className="flex-1 min-w-0 text-base tv:text-2xl">
                {subtitleLanguageName(code)}
                {index > 0 && <span className="hidden sm:inline ml-3 text-sm text-zinc-500 tv:text-lg">si no hay {subtitleLanguageName(languages[index - 1]).toLowerCase()}</span>}
              </span>
              {/* Fixed slots keep the buttons in columns, so Up/Down moves straight between rows */}
              <span className="w-12 flex justify-center tv:w-[4.25rem]">
                {index > 0 && (
                  <FocusButton variant="chip" className="px-3" onSelect={() => move(index, -1)}>
                    <ArrowUp className="w-5 h-5 tv:w-6 tv:h-6" aria-label="Subir" />
                  </FocusButton>
                )}
              </span>
              <span className="w-12 flex justify-center tv:w-[4.25rem]">
                {index < languages.length - 1 && (
                  <FocusButton variant="chip" className="px-3" onSelect={() => move(index, 1)}>
                    <ArrowDown className="w-5 h-5 tv:w-6 tv:h-6" aria-label="Bajar" />
                  </FocusButton>
                )}
              </span>
              <FocusButton
                variant="chip"
                className="ml-2"
                focusKey={`lang-remove-${code}`}
                onSelect={() => remove(index)}
              >
                <X className="w-4 h-4 mr-1.5 tv:w-5 tv:h-5 tv:mr-2" />
                Quitar
              </FocusButton>
            </div>
          ))}
        </FocusGroup>
      )}
      {available.length > 0 && (
        <>
          <p className="mb-3 text-sm text-zinc-400 tv:text-lg">Añadir idioma</p>
          <FocusGroup className="flex flex-wrap -mb-2 tv:-mb-3" onFocusInside={(node) => reveal(node)}>
            {available.map((lang, index) => (
              <FocusButton
                key={lang.code}
                variant="chip"
                className="mr-2 mb-2 tv:mr-3 tv:mb-3"
                focusKey={index === 0 ? "lang-add-first" : `lang-add-${lang.code}`}
                onSelect={() => add(lang.code, index)}
              >
                <Plus className="w-4 h-4 mr-1.5 tv:w-5 tv:h-5 tv:mr-2" />
                {lang.name}
              </FocusButton>
            ))}
          </FocusGroup>
        </>
      )}
    </>
  );
}

function SubtitlePreview({ styles }: { styles: SubtitleStyles }) {
  const blur = styles.background.includes("0.4");
  return (
    <div className="relative mb-10 flex items-end justify-center w-full max-w-[48rem] h-[13rem] sm:h-[22rem] md:mt-5 lg:mb-0 lg:h-[16rem] rounded-2xl tv:mt-0 tv:mb-10 tv:w-[48rem] tv:h-[27rem] overflow-hidden bg-gradient-to-br from-sky-900 via-indigo-950 to-zinc-900">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.18),transparent_45%)]" />
      <div
        className={`relative mb-6 px-3.5 py-1.5 rounded-lg text-center whitespace-pre-line leading-snug tracking-wide ${
          blur ? "bg-black/40 border border-white/10" : ""
        }`}
        style={{
          fontSize: `${SIZE_PX[styles.fontSize]}px`,
          fontFamily: subtitleFontFamily(styles.fontFamily),
          fontWeight: styles.fontWeight === "normal" ? "normal" : "bold",
          color: styles.color,
          backgroundColor: blur ? undefined : styles.background,
          ...subtitleOutlineStyles(styles),
        }}
      >
        {"¡No pienso rendirme!\nAsí son los subtítulos."}
      </div>
    </div>
  );
}

/** One card per theme, drawn in its own colors: a miniature of a screen in that palette */
function ThemePicker() {
  const current = useThemePreference();
  const reveal = useRevealOnFocus(160);
  return (
    <FocusGroup className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 tv:grid-cols-4 tv:gap-5" onFocusInside={(node) => reveal(node)}>
      {THEMES.map((theme) => {
        const p = theme.palette;
        const selected = theme.id === current;
        return (
          <FocusButton
            key={theme.id}
            variant="chip"
            active={selected}
            onSelect={() => setThemePreference(theme.id)}
            className="h-auto w-full flex-col items-stretch gap-3 p-3 rounded-2xl text-left whitespace-normal tv:p-4 tv:gap-4"
          >
            <span
              aria-hidden="true"
              className="relative block h-20 rounded-xl overflow-hidden tv:h-28"
              style={{ background: p.ink, boxShadow: `inset 0 0 0 1.5px ${p.line}` }}
            >
              <span className="absolute left-3 top-3 w-7 h-7 rounded-md -rotate-6 tv:w-9 tv:h-9" style={{ background: p.accent }} />
              <span className="absolute left-12 top-3.5 h-2 w-1/3 rounded-full tv:left-14 tv:top-4" style={{ background: p.paper }} />
              <span className="absolute left-12 top-7 h-1.5 w-1/4 rounded-full tv:left-14 tv:top-9" style={{ background: p.muted }} />
              <span className="absolute left-3 right-3 bottom-3 h-1.5 rounded-full flex overflow-hidden" style={{ background: p.ink3 }}>
                <span className="w-[45%]" style={{ background: p.accent }} />
                <span className="w-[12%]" style={{ background: p.second }} />
              </span>
            </span>
            <span className="flex items-center gap-2 font-bold">
              {selected && <Check className="w-4 h-4 shrink-0 tv:w-5 tv:h-5" />}
              {theme.name}
            </span>
          </FocusButton>
        );
      })}
    </FocusGroup>
  );
}

const UI_OPTIONS: Option<UiMode>[] = [
  { value: "web", label: "Ordenador y móvil" },
  { value: "tv", label: "TV, con mando" },
];

/** Playback preferences: audio, subtitle languages with their fallbacks, server and subtitle format */
export function SettingsScreen() {
  const mounted = useMounted();
  const uiMode = useUiMode();
  const prefs = usePlaybackPreferences();
  const styles = prefs.subtitleStyles;
  const setStyle = (patch: Partial<SubtitleStyles>) =>
    updatePlaybackPreferences({ subtitleStyles: { ...styles, ...patch } });

  return (
    <PageFrame title="Ajustes" subtitle="Se guardan en este dispositivo y se aplican a todos los episodios." ready={mounted}>
      <Section title="Apariencia">
        <Setting label="Tema" hint="Los colores de toda la biblioteca y del reproductor en este dispositivo.">
          <ThemePicker />
        </Setting>
        <Setting
          label="Interfaz"
          hint="La de TV se maneja con el mando o con el móvil vinculado; la de ordenador, con ratón, teclado o táctil. Se recuerda en este navegador."
        >
          <Options value={uiMode} options={UI_OPTIONS} onChange={(mode) => mode !== uiMode && switchUiMode(mode)} />
        </Setting>
      </Section>

      <Section title="Audio">
        <Setting label="Versión preferida" hint="Si un episodio no tiene doblaje, se reproduce la versión original.">
          <Options value={prefs.audio} options={AUDIO_OPTIONS} onChange={(audio) => updatePlaybackPreferences({ audio })} />
        </Setting>
      </Section>

      <Section title="Reproducción">
        <Setting label="Saltar la intro automáticamente">
          <Options
            value={prefs.autoSkipIntro}
            options={ON_OFF}
            onChange={(autoSkipIntro) => updatePlaybackPreferences({ autoSkipIntro })}
          />
        </Setting>
        <Setting label="Saltar el ending automáticamente">
          <Options
            value={prefs.autoSkipOutro}
            options={ON_OFF}
            onChange={(autoSkipOutro) => updatePlaybackPreferences({ autoSkipOutro })}
          />
        </Setting>
        <Setting
          label="Reproducir el siguiente episodio"
          hint="Al empezar el ending aparece el siguiente episodio con una cuenta atrás."
        >
          <Options
            value={prefs.autoplayNext}
            options={ON_OFF}
            onChange={(autoplayNext) => updatePlaybackPreferences({ autoplayNext })}
          />
        </Setting>
      </Section>

      <Section title="Subtítulos">
        <Setting label="Mostrar subtítulos">
          <Options
            value={prefs.subtitlesEnabled}
            options={ON_OFF}
            onChange={(subtitlesEnabled) => updatePlaybackPreferences({ subtitlesEnabled })}
          />
        </Setting>
        <Setting
          label="Idiomas, por orden de preferencia"
          hint="Se usa el primero disponible. Si ninguno está, se muestra la pista predeterminada del servidor."
        >
          <LanguageList languages={prefs.subtitleLanguages} />
        </Setting>
        <Setting
          label="Buscar el idioma en otros servidores"
          hint="Si tu idioma solo está en otro servidor, el reproductor cambia a ese servidor al empezar el episodio."
        >
          <Options
            value={prefs.switchServerForSubtitles}
            options={ON_OFF}
            onChange={(switchServerForSubtitles) => updatePlaybackPreferences({ switchServerForSubtitles })}
          />
        </Setting>
        <Setting label="Con el doblaje" hint="Qué subtítulos mostrar cuando el audio está doblado.">
          <Options
            value={prefs.dubSubtitles}
            options={DUB_SUBTITLE_OPTIONS}
            onChange={(dubSubtitles) => updatePlaybackPreferences({ dubSubtitles })}
          />
        </Setting>
      </Section>

      <Section title="Servidor">
        <Setting
          label="Servidor preferido"
          hint="Se prueba primero. Si falla, o no tiene tu idioma de subtítulos, se usa otro."
        >
          <Options
            value={prefs.preferredServer}
            options={SERVER_OPTIONS}
            onChange={(preferredServer) => updatePlaybackPreferences({ preferredServer })}
          />
        </Setting>
      </Section>

      <Section title="Formato de los subtítulos">
        {/* Computers: the preview stays in view beside the choices */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-x-8 tv:block">
          <div className="lg:order-2 lg:self-start lg:sticky lg:top-20 tv:static">
            <SubtitlePreview styles={styles} />
          </div>
          <div className="md:divide-y md:divide-white/10 tv:divide-y-0">
            <Setting label="Tamaño">
              <Options value={styles.fontSize} options={SIZE_OPTIONS} onChange={(fontSize) => setStyle({ fontSize })} />
            </Setting>
            <Setting label="Tipo de letra">
              <Options value={styles.fontFamily || "sans"} options={FONT_OPTIONS} onChange={(fontFamily) => setStyle({ fontFamily })} />
            </Setting>
            <Setting label="Grosor">
              <Options value={styles.fontWeight || "bold"} options={WEIGHT_OPTIONS} onChange={(fontWeight) => setStyle({ fontWeight })} />
            </Setting>
            <Setting label="Color">
              <Options value={styles.color} options={COLOR_OPTIONS} onChange={(color) => setStyle({ color })} />
            </Setting>
            <Setting label="Fondo">
              <Options value={styles.background} options={BACKGROUND_OPTIONS} onChange={(background) => setStyle({ background })} />
            </Setting>
            <Setting label="Contorno">
              <Options value={styles.outline || "thick"} options={OUTLINE_OPTIONS} onChange={(outline) => setStyle({ outline })} />
            </Setting>
            <Setting label="Sombra">
              <Options value={styles.shadow} options={ON_OFF} onChange={(shadow) => setStyle({ shadow })} />
            </Setting>
          </div>
        </div>
      </Section>

      <FocusGroup>
        <FocusButton variant="secondary" onSelect={resetPlaybackPreferences}>
          Restablecer ajustes
        </FocusButton>
      </FocusGroup>
    </PageFrame>
  );
}
