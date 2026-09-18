import { useMemo, useState, type FormEvent } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { download, exportBundle, messageOf } from "@/lib/api"
import type { ExportFile } from "@/lib/api_types"
import {
  applyNamePattern,
  FILE_NAME_TOKEN,
  safeEntryName,
  safeFileName,
} from "@/lib/file_name"
import { languages, SOURCE_LANGUAGE, type LanguageCode } from "@/lib/locale_data"

const DEFAULT_PATTERN = `${FILE_NAME_TOKEN}.json`

type ExportDialogProps = {
  /** `web/school` — only this app's keys are in the archive. */
  target: string
  targetTitle: string
  /** Pre-ticked alongside English: the language being worked on. */
  language: LanguageCode
}

/**
 * Exports one app as a zip of locale files.
 *
 * Each file is named by whoever exports it, because the application receiving
 * the archive decides what its locale files are called: `zh-Hans` here may
 * have to arrive as `zh_CN.json`, and a Flutter app wants `.arb`. The pattern
 * field names them all at once; a name typed over a row wins and stays put.
 *
 * The export always covers the whole app, never the current filters. An export
 * is a release artifact; having it depend on a search box someone left filled
 * in is how the wrong bundle ships.
 */
export function ExportDialog({
  target,
  targetTitle,
  language,
}: ExportDialogProps) {
  const defaultArchive = `${target.split("/").pop()}-translations`

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<LanguageCode>>(
    () => new Set([SOURCE_LANGUAGE, language])
  )
  const [pattern, setPattern] = useState(DEFAULT_PATTERN)
  /** Only the rows someone typed over — the rest follow the pattern. */
  const [renamed, setRenamed] = useState<Partial<Record<LanguageCode, string>>>(
    {}
  )
  const [archive, setArchive] = useState(defaultArchive)
  const [includeUntranslated, setIncludeUntranslated] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  const nameOf = (code: LanguageCode) =>
    renamed[code] ?? applyNamePattern(pattern, code)

  // Resolved here rather than only on the server, so the fields show what the
  // archive will actually contain.
  const files: ExportFile[] = useMemo(
    () =>
      languages
        .filter((item) => selected.has(item.code))
        .map((item) => ({
          language: item.code,
          name: safeEntryName(
            renamed[item.code] ?? applyNamePattern(pattern, item.code),
            `${item.code}.json`
          ),
        })),
    [selected, renamed, pattern]
  )

  const duplicate = useMemo(() => {
    const seen = new Set<string>()
    for (const file of files) {
      const name = file.name.toLowerCase()
      if (seen.has(name)) {
        return file.name
      }
      seen.add(name)
    }
    return null
  }, [files])

  const archiveName = safeFileName(archive, defaultArchive)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      // Reopening should offer the same sensible defaults, not the last edit.
      setSelected(new Set([SOURCE_LANGUAGE, language]))
      setPattern(DEFAULT_PATTERN)
      setRenamed({})
      setArchive(defaultArchive)
      setIncludeUntranslated(true)
    }
  }

  const toggle = (code: LanguageCode, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(code)
      } else {
        next.delete(code)
      }
      return next
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (files.length === 0 || duplicate) {
      return
    }

    setIsExporting(true)
    try {
      const { blob, filename } = await exportBundle({
        target,
        files,
        name: archiveName,
        includeUntranslated,
      })

      download(blob, filename)
      handleOpenChange(false)
      toast.success(`Exported ${filename}`, {
        description: `${files.length} ${
          files.length === 1 ? "file" : "files"
        } from ${targetTitle}.`,
      })
    } catch (cause: unknown) {
      toast.error("Could not export", { description: messageOf(cause) })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Download data-icon="inline-start" />
            Export
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Export {targetTitle}</DialogTitle>
            <DialogDescription>
              One file per language, zipped. Every key in this app, not only
              what the filters show.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="export-pattern">File names</Label>
            <Input
              id="export-pattern"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder={DEFAULT_PATTERN}
              className="font-mono"
            />
            <p className="text-muted-foreground text-xs">
              <span className="font-mono">{FILE_NAME_TOKEN}</span> becomes the
              language code. Rename a row below to give one language a name of
              its own.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label>Languages</Label>
              <span className="text-muted-foreground text-xs tabular-nums">
                {selected.size} of {languages.length}
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(new Set(languages.map((item) => item.code)))
                  }
                >
                  All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                >
                  None
                </Button>
              </div>
            </div>

            <ul className="max-h-64 overflow-auto">
              {languages.map((item) => {
                const isOn = selected.has(item.code)

                return (
                  <li
                    key={item.code}
                    className="flex items-center gap-2 py-1 pr-1"
                  >
                    <Label className="flex w-44 shrink-0 items-center gap-2 font-normal">
                      <Checkbox
                        checked={isOn}
                        onCheckedChange={(checked) =>
                          toggle(item.code, checked === true)
                        }
                      />
                      <span className="truncate">{item.name}</span>
                    </Label>
                    <Input
                      value={nameOf(item.code)}
                      onChange={(event) =>
                        setRenamed((current) => ({
                          ...current,
                          [item.code]: event.target.value,
                        }))
                      }
                      disabled={!isOn}
                      aria-label={`File name for ${item.name}`}
                      className="h-8 font-mono text-xs"
                    />
                  </li>
                )
              })}
            </ul>

            {duplicate && (
              <p className="text-destructive text-xs">
                Two languages are both called{" "}
                <span className="font-mono">{duplicate}</span>. One would
                overwrite the other in the archive.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="export-archive">Archive name</Label>
            <div className="flex items-center gap-2">
              <Input
                id="export-archive"
                value={archive}
                onChange={(event) => setArchive(event.target.value)}
                placeholder={defaultArchive}
                className="font-mono"
              />
              <span className="text-muted-foreground font-mono text-sm">
                .zip
              </span>
            </div>
            {archiveName !== archive.replace(/\.zip$/i, "") && (
              <p className="text-muted-foreground text-xs">
                Saved as <span className="font-mono">{archiveName}.zip</span>
              </p>
            )}
          </div>

          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={includeUntranslated}
              onCheckedChange={(checked) =>
                setIncludeUntranslated(checked === true)
              }
            />
            <span>
              Include untranslated keys
              <span className="text-muted-foreground">
                {" "}
                — the ones this app calls missing: empty, or still English.
                Leave them out for a runtime bundle that falls back on its own.
              </span>
            </span>
          </Label>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={isExporting || files.length === 0 || Boolean(duplicate)}
            >
              <Download data-icon="inline-start" />
              {isExporting ? "Exporting…" : "Export"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
