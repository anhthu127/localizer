import { AlertTriangle, ArrowLeft, FileJson, Upload, X } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { BundleDiffView } from "@/components/translations/bundle_diff_view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { navLeaves } from "@/config/nav_items";
import { profileOf } from "@/config/target_profiles";
import { useTargetBundles } from "@/hooks/use_target_bundles";
import { deleteKeys, importBundle, messageOf } from "@/lib/api";
import type { ImportMode, ImportResponse } from "@/lib/api_types";
import {
  BundleFileError,
  changeCount,
  diffBundle,
  parseBundleFile,
  type BundleDiff,
} from "@/lib/bundle_diff";
import {
  languages,
  SOURCE_LANGUAGE,
  type LanguageCode,
  type LocaleBundle,
} from "@/lib/locale_data";
import { cn } from "@/lib/utils";

/** A file that parsed, waiting for a language and a reviewer. */
type StagedFile = {
  id: string;
  name: string;
  values: LocaleBundle;
  /** Null until somebody says which language it is — never guessed silently. */
  language: LanguageCode | null;
};

/** What one file's write came back as. */
type ImportResult = {
  id: string;
  name: string;
  language: LanguageCode;
  response: ImportResponse | null;
  error: string | null;
};

/** A finished delivery: every file's write, and the retire that followed. */
type ImportOutcome = {
  files: ImportResult[];
  /** Keys no file carried, dropped from the registry — 0 unless replacing. */
  retired: number;
  /** Why the retire did not happen, when it was meant to. */
  retireError: string | null;
};

const targetOptions = navLeaves.map(({ section, leaf }) => ({
  path: `${section.id}/${leaf.id}`,
  label: `${section.title} · ${leaf.title}`,
}));
/**
 * Route: `/import` — the import wizard, `?target=web/school` optional.
 *
 * Its own screen rather than a dialog on the workspace, because a delivery is
 * a dozen files at once and each one needs a language, a diff and a decision.
 * That does not fit beside a grid, and it is not something a reader stumbles
 * into: the sidebar carries it, and the workspace's Import button is a link to
 * here with the app already chosen.
 *
 * The app cannot be read off the files. Key uniqueness is per target — School
 * and Parent both define `home.title`, differently — so an `en.json` on its own
 * does not say where it belongs, and asking is the only honest thing to do.
 *
 * Four steps, all on one page rather than behind a stepper: the reviewer
 * reading the diff in step three is the same person who has to remember which
 * app they picked in step one, and hiding it from them is how the wrong bundle
 * gets accepted. Nothing is written until Confirm — see `docs/redesign_brief.md`,
 * §3.7.
 */
export function ImportPage() {
  const [params, setParams] = useSearchParams();
  const target = params.get("target") ?? "";

  const [files, setFiles] = useState<StagedFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Off by default: a replace now retires keys from the app entirely, which is
  // a decision about the product rather than about a translation delivery.
  const [mode, setMode] = useState<ImportMode>("merge");
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ImportOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sectionId, leafId] = target.split("/");
  const profile = profileOf(sectionId, leafId);
  const targetLabel =
    targetOptions.find((option) => option.path === target)?.label ?? target;

  // Base UI hands back null when a select is cleared; there is no "no app".
  const setTarget = (value: string | null) => {
    if (!value) {
      return;
    }
    const next = new URLSearchParams(params);
    next.set("target", value);
    setParams(next, { replace: true });
    // The files stay — the same delivery aimed at a different app is a real
    // correction — but everything read about the old app is now wrong.
    setResults(null);
  };

  const codes = useMemo(
    () => [
      ...new Set(
        files
          .map((file) => file.language)
          .filter((code): code is LanguageCode => code !== null),
      ),
    ],
    [files],
  );

  const bundles = useTargetBundles(target, codes);

  const diffs = useMemo(() => {
    const out = new Map<string, BundleDiff>();

    for (const file of files) {
      // `undefined` is "not read yet"; `[]` is an app with no keys, which a
      // file can now fill on its own — every key in it reads as new.
      const rows = file.language ? bundles.rows.get(file.language) : undefined;
      if (!file.language || !rows) {
        continue;
      }
      out.set(
        file.id,
        diffBundle(rows, file.values, {
          mode,
          language: file.language,
          lengthBudget: profile.lengthBudget,
          maxLength: profile.maxLength,
        }),
      );
    }

    return out;
  }, [files, bundles.rows, mode, profile.lengthBudget, profile.maxLength]);

  const totalChanges = useMemo(
    () =>
      [...diffs.values()].reduce(
        (sum, diff) => sum + changeCount(diff.counts),
        0,
      ),
    [diffs],
  );

  /** Two files aimed at one language would write the same file twice. */
  const duplicated = useMemo(() => {
    const seen = new Map<LanguageCode, number>();
    for (const file of files) {
      if (file.language) {
        seen.set(file.language, (seen.get(file.language) ?? 0) + 1);
      }
    }
    return new Set(
      [...seen].filter(([, times]) => times > 1).map(([code]) => code),
    );
  }, [files]);

  /**
   * The keys a true replace retires: the ones no file in the delivery carries.
   *
   * Computed across the batch rather than per file, because a file is one
   * language and the delivery is the statement about the app's key list. Were
   * it per file, importing `vi.json` without a key would unregister it and the
   * `ja.json` behind it in the same delivery would register it again, English
   * and all, as something new.
   *
   * Any one language's rows will do for the registry: `/entries` answers per
   * key record, not per value, so every language sees the same key list.
   */
  const retired = useMemo(() => {
    if (mode !== "replace") {
      return [];
    }

    const [registry] = [...bundles.rows.values()];
    if (!registry) {
      return [];
    }

    const carried = new Set(files.flatMap((file) => Object.keys(file.values)));
    return registry.map((row) => row.key).filter((key) => !carried.has(key));
  }, [mode, bundles.rows, files]);

  const unassigned = files.filter((file) => file.language === null).length;
  const selected =
    files.find((file) => file.id === selectedId) ?? files[0] ?? null;

  const blocker = whyNot({
    target,
    fileCount: files.length,
    unassigned,
    duplicated: duplicated.size,
    isLoading: bundles.isLoading,
    error: bundles.error,
    totalChanges,
  });

  const readFiles = async (list: FileList | File[]) => {
    const added: StagedFile[] = [];
    const failed: string[] = [];

    for (const file of Array.from(list)) {
      try {
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          values: parseBundleFile(await file.text()),
          language: languageFromName(file.name),
        });
      } catch (cause: unknown) {
        failed.push(
          `${file.name} — ${
            cause instanceof BundleFileError ? cause.message : messageOf(cause)
          }`,
        );
      }
    }

    if (added.length > 0) {
      setFiles((current) => [...current, ...added]);
      setSelectedId((current) => current ?? added[0].id);
      setResults(null);
    }

    if (failed.length > 0) {
      toast.error(
        `${failed.length} ${failed.length === 1 ? "file" : "files"} could not be read`,
        { description: failed.join("\n") },
      );
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      void readFiles(event.dataTransfer.files);
    }
  };

  const removeFile = (id: string) =>
    setFiles((current) => current.filter((file) => file.id !== id));

  const assign = (id: string, language: LanguageCode) =>
    setFiles((current) =>
      current.map((file) => (file.id === id ? { ...file, language } : file)),
    );

  /**
   * One request per file, in order and not in parallel: they write into the
   * same app, and a half-applied delivery is easier to read when the failure
   * is the last line rather than one of twelve interleaved ones.
   */
  const handleImport = async () => {
    if (blocker) {
      return;
    }

    setIsImporting(true);
    const done: ImportResult[] = [];

    for (const file of files) {
      if (!file.language) {
        continue;
      }
      try {
        done.push({
          id: file.id,
          name: file.name,
          language: file.language,
          response: await importBundle(
            target,
            file.language,
            file.values,
            mode,
          ),
          error: null,
        });
      } catch (cause: unknown) {
        done.push({
          id: file.id,
          name: file.name,
          language: file.language,
          response: null,
          error: messageOf(cause),
        });
      }
    }

    const failed = done.filter((result) => result.error).length;

    // Only once every file landed. A half-applied delivery says nothing about
    // which keys the app still has, and retiring on the strength of it would
    // delete keys the file that failed was carrying.
    let retiredCount = 0;
    let retireError: string | null = null;

    if (retired.length > 0 && failed === 0) {
      try {
        const result = await deleteKeys({
          target,
          keys: retired,
          scope: "all",
        });
        retiredCount = result.deleted;
      } catch (cause: unknown) {
        retireError = messageOf(cause);
      }
    }

    setResults({ files: done, retired: retiredCount, retireError });
    setIsImporting(false);

    if (failed > 0) {
      toast.error(
        `${failed} of ${done.length} could not be written — see the results below`,
      );
    } else if (retireError) {
      toast.error("Imported, but the keys left out could not be retired", {
        description: retireError,
      });
    } else {
      toast.success(
        `Imported ${done.length} ${done.length === 1 ? "file" : "files"} into ${targetLabel}`,
        retiredCount > 0
          ? {
              description: `${retiredCount} ${retiredCount === 1 ? "key" : "keys"} no file carried were removed from the app.`,
            }
          : undefined,
      );
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <div className="mr-1 flex items-center gap-2">
          <h2 className="text-base font-semibold">Import</h2>
          <Badge variant="secondary">Language files</Badge>
        </div>
        {target && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            render={<Link to={`/${target}`} />}
          >
            <ArrowLeft data-icon="inline-start" />
            Back to {targetLabel}
          </Button>
        )}
      </div>

      <div className="flex max-w-4xl flex-col gap-6 p-4">
        <Step
          index={1}
          title="Which app"
          hint="A file does not say where it belongs — the same key exists in more than one app, holding different text."
        >
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Choose an app…" />
            </SelectTrigger>
            <SelectContent>
              {targetOptions.map((option) => (
                <SelectItem key={option.path} value={option.path}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Step>

        <Step
          index={2}
          title="The files"
          hint="One file per language. Drop as many as the delivery holds."
          disabled={target === ""}
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) {
                void readFiles(event.target.files);
              }
              // Cleared so choosing the same file twice still fires a change.
              event.target.value = "";
            }}
          />

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border border-dashed text-center transition-colors",
              files.length > 0 ? "px-6 py-5" : "px-6 py-10",
              isDragging && "border-primary bg-accent/40",
            )}
          >
            <Upload className="text-muted-foreground size-6" />
            <p className="text-sm">
              Drop <span className="font-mono text-xs">.json</span> files here
            </p>
            {files.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Flat or nested —{" "}
                <span className="font-mono">{`{ "nav.home": "…" }`}</span> and{" "}
                <span className="font-mono">{`{ "nav": { "home": "…" } }`}</span>{" "}
                both read the same.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              Choose files
            </Button>
          </div>

          {files.length > 0 && (
            <div className="flex flex-col divide-y rounded-md border">
              {files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  diff={diffs.get(file.id)}
                  isSelected={selected?.id === file.id}
                  isDuplicate={
                    file.language !== null && duplicated.has(file.language)
                  }
                  onSelect={() => setSelectedId(file.id)}
                  onAssign={(language) => assign(file.id, language)}
                  onRemove={() => removeFile(file.id)}
                />
              ))}
            </div>
          )}
        </Step>

        <Step
          index={3}
          title="What it would change"
          hint="Read the diff before accepting it. Nothing is written until you confirm."
          disabled={files.length === 0}
        >
          {bundles.error && (
            <p className="text-destructive text-sm">
              Could not read what {targetLabel} holds today: {bundles.error}
            </p>
          )}

          {bundles.isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {selected && !bundles.isLoading && !bundles.error && (
            <DiffForFile file={selected} diff={diffs.get(selected.id)} />
          )}

          <Label className="flex items-start gap-2 font-normal">
            <Checkbox
              checked={mode === "replace"}
              onCheckedChange={(checked) =>
                setMode(checked === true ? "replace" : "merge")
              }
            />
            <span>
              Clear the keys these files leave out
              <span className="text-muted-foreground">
                {" "}
                — a true replace, applied to every file below. A key one file
                omits loses its value in that language; a key <em>no</em> file
                carries is retired from the app altogether, in all{" "}
                {languages.length} languages. Leave it off when the delivery is
                partial and the keys it omits should keep what they have.
              </span>
            </span>
          </Label>

          {/* The one thing on this screen that reaches languages the reviewer
              is not importing, so it is counted for them before Confirm rather
              than reported afterwards. */}
          {retired.length > 0 && (
            <p className="text-destructive flex items-start gap-1.5 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {retired.length} {retired.length === 1 ? "key is" : "keys are"}{" "}
                in none of these files and will be deleted from {targetLabel}{" "}
                entirely — the {retired.length === 1 ? "key" : "keys"} and{" "}
                {retired.length === 1 ? "its" : "their"} text in every language,
                not only the {codes.length === 1 ? "one" : codes.length} you are
                importing.{" "}
                <span className="font-mono">
                  {retired.slice(0, 3).join(", ")}
                </span>
                {retired.length > 3 && ` and ${retired.length - 3} more`}.
              </span>
            </p>
          )}
        </Step>

        <Step
          index={4}
          title="Confirm"
          hint="Each file replaces one language of one app."
          disabled={files.length === 0}
        >
          {results ? (
            <Results outcome={results} target={target} label={targetLabel} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={blocker !== null || isImporting}
                onClick={() => void handleImport()}
              >
                <Upload data-icon="inline-start" />
                {isImporting
                  ? "Importing…"
                  : `Import ${files.length} ${files.length === 1 ? "file" : "files"} · ${totalChanges} ${totalChanges === 1 ? "change" : "changes"}`}
              </Button>
              {blocker && (
                <span className="text-muted-foreground text-sm">{blocker}</span>
              )}
            </div>
          )}
        </Step>
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  hint,
  disabled = false,
  children,
}: {
  index: number;
  title: string;
  hint: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 transition-opacity",
        disabled && "pointer-events-none opacity-40",
      )}
      aria-disabled={disabled}
    >
      <div className="flex items-baseline gap-2">
        <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
          {index}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground min-w-0 text-xs">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** One staged file: what it is, which language it claims, what it would cost. */
function FileRow({
  file,
  diff,
  isSelected,
  isDuplicate,
  onSelect,
  onAssign,
  onRemove,
}: {
  file: StagedFile;
  diff: BundleDiff | undefined;
  isSelected: boolean;
  isDuplicate: boolean;
  onSelect: () => void;
  onAssign: (language: LanguageCode) => void;
  onRemove: () => void;
}) {
  const changes = diff ? changeCount(diff.counts) : null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 px-3 py-2",
        isSelected && "bg-accent/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <FileJson className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 truncate font-mono text-xs">{file.name}</span>
        <Badge variant="outline" className="shrink-0 tabular-nums">
          {Object.keys(file.values).length} keys
        </Badge>
        {changes !== null && (
          <Badge
            variant={changes > 0 ? "default" : "secondary"}
            className="shrink-0 tabular-nums"
          >
            {changes} {changes === 1 ? "change" : "changes"}
          </Badge>
        )}
        {diff && diff.errors > 0 && (
          <span className="text-destructive flex shrink-0 items-center gap-1 text-xs">
            <AlertTriangle className="size-3.5" />
            {diff.errors}
          </span>
        )}
      </button>

      <Select
        value={file.language ?? ""}
        onValueChange={(value) => onAssign(value as LanguageCode)}
      >
        <SelectTrigger
          className={cn("w-44", isDuplicate && "border-destructive")}
        >
          <SelectValue placeholder="Choose a language…" />
        </SelectTrigger>
        <SelectContent>
          {languages.map((item) => (
            <SelectItem key={item.code} value={item.code}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}

function DiffForFile({
  file,
  diff,
}: {
  file: StagedFile;
  diff: BundleDiff | undefined;
}) {
  const language = languages.find((item) => item.code === file.language);

  if (!file.language) {
    return (
      <p className="text-muted-foreground text-sm">
        Say which language{" "}
        <span className="font-mono text-xs">{file.name}</span> is, and its diff
        appears here.
      </p>
    );
  }

  if (!diff) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-mono">{file.name}</span> →{" "}
        {language?.name ?? file.language}
      </p>

      <BundleDiffView
        diff={diff}
        languageName={language?.name ?? file.language}
        isRtl={language?.rtl ?? false}
      />

      {diff.counts.new > 0 && (
        <p className="text-muted-foreground text-xs">
          {diff.counts.new} {diff.counts.new === 1 ? "key is" : "keys are"} new
          to this app and will be registered, with every other language given
          the same {diff.counts.new === 1 ? "key" : "keys"} and no text yet
          {file.language !== SOURCE_LANGUAGE &&
            " — English included, so they read as missing there until somebody writes them"}
          .
        </p>
      )}

      {diff.invalid.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {diff.invalid.length}{" "}
          {diff.invalid.length === 1 ? "key is" : "keys are"} named in a way
          this app cannot store and will be skipped —{" "}
          <span className="font-mono">
            {diff.invalid.slice(0, 3).join(", ")}
          </span>
          {diff.invalid.length > 3 && ` and ${diff.invalid.length - 3} more`}. A
          key is dot-separated segments — group.section.name.
        </p>
      )}
    </div>
  );
}

function Results({
  outcome,
  target,
  label,
}: {
  outcome: ImportOutcome;
  target: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y rounded-md border">
        {outcome.files.map((result) => (
          <div
            key={result.id}
            className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {result.name}
            </span>
            {result.error ? (
              <span className="text-destructive flex items-center gap-1.5 text-xs">
                <AlertTriangle className="size-3.5 shrink-0" />
                {result.error}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs tabular-nums">
                {result.response?.created} new · {result.response?.added} added
                · {result.response?.changed} changed ·{" "}
                {result.response?.removed} cleared →{" "}
                <span className="font-mono">{result.response?.file}</span>
              </span>
            )}
          </div>
        ))}
      </div>

      {outcome.retireError ? (
        <p className="text-destructive flex items-start gap-1.5 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          The files were written, but the keys they left out could not be
          retired: {outcome.retireError}
        </p>
      ) : (
        outcome.retired > 0 && (
          <p className="text-muted-foreground text-sm">
            {outcome.retired} {outcome.retired === 1 ? "key" : "keys"} no file
            carried {outcome.retired === 1 ? "was" : "were"} removed from{" "}
            {label} and every one of its language files.
          </p>
        )
      )}

      <div>
        <Button render={<Link to={`/${target}`} />}>Open {label}</Button>
      </div>
    </div>
  );
}

/**
 * A file named after a language is usually meant for it, and picking the wrong
 * one is the mistake this screen exists to prevent — so a name that does not
 * name a language is left unassigned rather than guessed at.
 *
 * `.` and `_` split, `-` does not: `zh-Hans` is a code, `vi_VN` is a code and a
 * region, and `school.vi.json` is a file named after both.
 */
function languageFromName(name: string): LanguageCode | null {
  const base = name.replace(/\.json$/i, "");
  const candidates = new Set(
    [base, ...base.split(/[._]/)].map((part) => part.trim().toLowerCase()),
  );

  return (
    languages.find((item) => candidates.has(item.code.toLowerCase()))?.code ??
    null
  );
}

/** The one sentence saying why Confirm is off, or null when it is on. */
function whyNot(state: {
  target: string;
  fileCount: number;
  unassigned: number;
  duplicated: number;
  isLoading: boolean;
  error: string | null;
  totalChanges: number;
}): string | null {
  if (state.target === "") {
    return "Choose an app first.";
  }
  if (state.fileCount === 0) {
    return "Add at least one file.";
  }
  if (state.unassigned > 0) {
    return `${state.unassigned} ${state.unassigned === 1 ? "file has" : "files have"} no language yet.`;
  }
  if (state.duplicated > 0) {
    return "Two files claim the same language — one would overwrite the other.";
  }
  if (state.error) {
    return "The app's current values could not be read.";
  }
  if (state.isLoading) {
    return "Reading what the app holds today…";
  }
  if (state.totalChanges === 0) {
    return "These files change nothing.";
  }
  return null;
}
