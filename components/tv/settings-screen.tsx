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
import { FocusButton, FocusGroup } from "./focusable";
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

function Setting({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h3 className="text-2xl font-bold">{label}</h3>
      {hint && <p className="mt-2 max-w-[60rem] text-lg text-zinc-400 leading-snug">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="mb-8 pb-3 text-lg font-bold uppercase tracking-widest text-zinc-500 border-b border-white/10">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Options<T>({ value, options, onChange }: { value: T; options: Option<T>[]; onChange: (value: T) => void }) {
  const reveal = useRevealOnFocus(160);
  return (
    <FocusGroup className="flex flex-wrap -mb-3" onFocusInside={(node) => reveal(node)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <FocusButton key={String(option.value)} variant="chip" className="mr-3 mb-3" active={selected} onSelect={() => onChange(option.value)}>
            {option.swatch && (
              <span className="w-5 h-5 mr-3 rounded-full ring-2 ring-black/30" style={{ background: option.swatch }} />
            )}
            {selected && !option.swatch && <Check className="w-5 h-5 mr-2" />}
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
        <p className="mb-6 text-xl text-zinc-400">
          Sin idiomas elegidos: se usa la pista predeterminada de cada servidor.
        </p>
      ) : (
        <FocusGroup className="mb-6 max-w-[52rem] space-y-3" onFocusInside={(node) => reveal(node)}>
          {languages.map((code, index) => (
            <div key={code} className="flex items-center h-16 pl-6 pr-2 rounded-2xl bg-white/5">
              <span className="w-10 text-xl font-bold text-zinc-500">{index + 1}</span>
              <span className="flex-1 text-2xl">
                {subtitleLanguageName(code)}
                {index > 0 && <span className="ml-3 text-lg text-zinc-500">si no hay {subtitleLanguageName(languages[index - 1]).toLowerCase()}</span>}
              </span>
              {/* Fixed slots keep the buttons in columns, so Up/Down moves straight between rows */}
              <span className="w-[4.25rem] flex justify-center">
                {index > 0 && (
                  <FocusButton variant="chip" className="px-3" onSelect={() => move(index, -1)}>
                    <ArrowUp className="w-6 h-6" aria-label="Subir" />
                  </FocusButton>
                )}
              </span>
              <span className="w-[4.25rem] flex justify-center">
                {index < languages.length - 1 && (
                  <FocusButton variant="chip" className="px-3" onSelect={() => move(index, 1)}>
                    <ArrowDown className="w-6 h-6" aria-label="Bajar" />
                  </FocusButton>
                )}
              </span>
              <FocusButton
                variant="chip"
                className="ml-2"
                focusKey={`lang-remove-${code}`}
                onSelect={() => remove(index)}
              >
                <X className="w-5 h-5 mr-2" />
                Quitar
              </FocusButton>
            </div>
          ))}
        </FocusGroup>
      )}
      {available.length > 0 && (
        <>
          <p className="mb-3 text-lg text-zinc-400">Añadir idioma</p>
          <FocusGroup className="flex flex-wrap -mb-3" onFocusInside={(node) => reveal(node)}>
            {available.map((lang, index) => (
              <FocusButton
                key={lang.code}
                variant="chip"
                className="mr-3 mb-3"
                focusKey={index === 0 ? "lang-add-first" : `lang-add-${lang.code}`}
                onSelect={() => add(lang.code, index)}
              >
                <Plus className="w-5 h-5 mr-2" />
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
    <div className="relative mb-10 flex items-end justify-center w-[48rem] h-[27rem] rounded-2xl overflow-hidden bg-gradient-to-br from-sky-900 via-indigo-950 to-zinc-900">
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

/** Playback preferences: audio, subtitle languages with their fallbacks, server and subtitle format */
export function SettingsScreen() {
  const mounted = useMounted();
  const prefs = usePlaybackPreferences();
  const styles = prefs.subtitleStyles;
  const setStyle = (patch: Partial<SubtitleStyles>) =>
    updatePlaybackPreferences({ subtitleStyles: { ...styles, ...patch } });

  return (
    <PageFrame title="Ajustes" subtitle="Se guardan en este dispositivo y se aplican a todos los episodios." ready={mounted}>
      <Section title="Audio">
        <Setting label="Versión preferida" hint="Si un episodio no tiene doblaje, se reproduce la versión original.">
          <Options value={prefs.audio} options={AUDIO_OPTIONS} onChange={(audio) => updatePlaybackPreferences({ audio })} />
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
        <SubtitlePreview styles={styles} />
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
      </Section>

      <FocusGroup>
        <FocusButton variant="secondary" onSelect={resetPlaybackPreferences}>
          Restablecer ajustes
        </FocusButton>
      </FocusGroup>
    </PageFrame>
  );
}
