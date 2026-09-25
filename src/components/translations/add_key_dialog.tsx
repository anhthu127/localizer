import { useState, type FormEvent } from "react"
import { ArrowUpRight, Braces, Plus } from "lucide-react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { createKey, messageOf } from "@/lib/api"
import {
  groupKeyOf,
  isValidKey,
  languages,
  SOURCE_LANGUAGE,
  type LanguageCode,
} from "@/lib/locale_data"
import { placeholdersOf } from "@/lib/validation"
import { workspaceLink } from "@/lib/workspace_link"
import { Textarea } from "@/components/ui/textarea"

type Created = {
  key: string
  source: string
  languages: LanguageCode[]
}

type AddKeyDialogProps = {
  /** `web/school` - the app the key is created in, and the only one it reaches. */
  target: string
  /** How the app is named in the menu, for the dialog's copy. */
  targetTitle: string
  /** `/web/school` - where the confirmation's language links point. */
  targetLink: string
  /** Called once the server has written the key, with the key it wrote. */
  onCreated: (key: string) => void
  size?: "sm" | "default"
  variant?: "default" | "outline"
}

/**
 * Adding a key belongs to an app, not to the product.
 *
 * Each target is its own application with its own key namespace, so there is
 * no sensible global "add a key" - the question "to which app?" has to be
 * answered before the form makes sense, and the workspace has already answered
 * it. `POST /api/keys` therefore carries this screen's target, and the key is
 * written for that target only.
 *
 * Within the app, though, a key reaches every language at once: English gets
 * the text, the other twelve get an empty value, and the confirmation below
 * shows exactly that.
 */
export function AddKeyDialog({
  target,
  targetTitle,
  targetLink,
  onCreated,
  size = "default",
  variant = "default",
}: AddKeyDialogProps) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState("")
  const [text, setText] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)

  const trimmedKey = key.trim()
  const group = trimmedKey ? groupKeyOf(trimmedKey) : ""
  const placeholders = placeholdersOf(text)

  const formatError =
    trimmedKey && !isValidKey(trimmedKey)
      ? "Use dot-separated segments - group.section.name."
      : null
  const keyError =
    serverError ??
    formatError ??
    (submitted && !trimmedKey ? "Key is required." : null)
  const textError =
    submitted && !text.trim() ? "English text is required." : null

  const reset = () => {
    setKey("")
    setText("")
    setSubmitted(false)
    setServerError(null)
    setCreated(null)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      reset()
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    setServerError(null)

    const source = text.trim()
    if (!trimmedKey || !source || formatError) {
      return
    }

    setIsSubmitting(true)
    try {
      const response = await createKey({ key: trimmedKey, source, target })
      setCreated({
        key: response.key.key,
        source,
        languages: response.languages,
      })
      onCreated(response.key.key)
    } catch (cause: unknown) {
      // 400 and 409 are the server's own validation: show them on the field
      // that caused them rather than in a toast that disappears.
      setServerError(messageOf(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size={size} variant={variant}>
            <Plus data-icon="inline-start" />
            Add key
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Key added to {targetTitle}</DialogTitle>
              <DialogDescription>
                <span className="font-mono text-xs">{created.key}</span> -
                written to {created.languages.length} language files for this
                app, missing in {created.languages.length - 1} of them until
                someone translates it.
              </DialogDescription>
            </DialogHeader>

            <ul className="max-h-72 overflow-auto">
              {languages.map((language) => {
                const isSource = language.code === SOURCE_LANGUAGE

                return (
                  <li
                    key={language.code}
                    className="flex items-center gap-2 border-b py-1.5 last:border-b-0"
                  >
                    <span className="w-28 shrink-0 truncate">
                      {language.name}
                    </span>
                    {isSource ? (
                      <>
                        <span className="min-w-0 flex-1 truncate">
                          {created.source}
                        </span>
                        <Badge variant="secondary">Source</Badge>
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground min-w-0 flex-1 truncate">
                          No translation
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          render={
                            <Link
                              to={workspaceLink(
                                { lang: language.code, q: created.key },
                                targetLink
                              )}
                              onClick={() => handleOpenChange(false)}
                            />
                          }
                        >
                          Translate
                          <ArrowUpRight data-icon="inline-end" />
                        </Button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>

            <DialogFooter showCloseButton>
              <Button variant="outline" onClick={reset}>
                <Plus data-icon="inline-start" />
                Add another
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="contents">
            <DialogHeader>
              <DialogTitle>Add a key to {targetTitle}</DialogTitle>
              <DialogDescription>
                The key is created for this app only. Every other app keeps its
                own namespace.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-key">Key</Label>
              <Input
                id="add-key"
                value={key}
                onChange={(event) => {
                  setKey(event.target.value)
                  setServerError(null)
                }}
                placeholder="campus.form.actions.archive"
                className="font-mono"
                aria-invalid={Boolean(keyError)}
                autoFocus
              />
              {keyError ? (
                <p className="text-destructive text-xs">{keyError}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {group ? (
                    <>
                      Group <span className="font-mono">{group}</span>
                    </>
                  ) : (
                    "The first dot-segment becomes the group this list filters by."
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-key-text">English text</Label>
              <Textarea
                id="add-key-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Archive campus"
                className="min-h-20 resize-y"
                aria-invalid={Boolean(textError)}
              />
              {textError ? (
                <p className="text-destructive text-xs">{textError}</p>
              ) : placeholders.length > 0 ? (
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Braces className="size-3.5" />
                  Placeholders {placeholders.join(" ")} - every translation must
                  keep them.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Use {"{name}"} for values filled in at runtime.
                </p>
              )}
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding…" : "Add key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
