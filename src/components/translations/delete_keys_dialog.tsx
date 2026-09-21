import { useState } from "react"
import { Trash2 } from "lucide-react"
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
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { deleteKeys, messageOf } from "@/lib/api"
import type { DeleteScope } from "@/lib/api_types"
import { languages, SOURCE_LANGUAGE, type LanguageCode } from "@/lib/locale_data"

/** Keys listed in full before the count takes over. */
const PREVIEW = 6

type DeleteKeysDialogProps = {
  /** `web/school` — the app the keys are deleted from, and the only one. */
  target: string
  /** How the app is named in the menu, for the dialog's copy. */
  targetTitle: string
  /** The language on screen: what a scoped delete clears. */
  language: LanguageCode
  languageName: string
  /** The keys to delete. The dialog is open while this is non-empty. */
  keys: string[]
  onClose: () => void
  /** Called once the server has written, with the keys it was given. */
  onDeleted: (keys: string[]) => void
}

/**
 * The one confirmation for every delete on the workspace — one row's trash
 * button and a selection of four thousand reach the same dialog, because they
 * ask the same question and a bulk delete is the one that deserves it.
 *
 * That question is how far it goes. Clearing a language is a translator's
 * cleanup: the key stays registered, reads as missing here and keeps its text
 * in the other twelve languages. Deleting everywhere retires the string from
 * the app, which is a decision about the product rather than about this
 * language, so it is the checkbox and never the default.
 */
export function DeleteKeysDialog({
  target,
  targetTitle,
  language,
  languageName,
  keys,
  onClose,
  onDeleted,
}: DeleteKeysDialogProps) {
  const [everywhere, setEverywhere] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const count = keys.length
  const noun = count === 1 ? "key" : "keys"
  const them = count === 1 ? "it" : "them"
  const others = languages.length - 1

  const handleOpenChange = (next: boolean) => {
    if (!next && !isDeleting) {
      setEverywhere(false)
      onClose()
    }
  }

  const handleDelete = async () => {
    const scope: DeleteScope = everywhere ? "all" : "language"

    setIsDeleting(true)
    try {
      const result = await deleteKeys({ target, keys, scope, language })
      onDeleted(keys)
      setEverywhere(false)
      onClose()
      toast.success(
        `Deleted ${result.deleted} ${result.deleted === 1 ? "key" : "keys"}`,
        {
          description:
            scope === "all"
              ? `Removed from ${targetTitle} and its ${result.files.length} language files.`
              : `Cleared in ${languageName}. Every other language kept its translation.`,
        }
      )
    } catch (cause: unknown) {
      toast.error("Could not delete", { description: messageOf(cause) })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={count > 0} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Delete {count} {noun}
          </DialogTitle>
          <DialogDescription>
            From {targetTitle}. No other app is touched — each one keeps its own
            keys.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-40 overflow-auto rounded-md border p-2">
          {keys.slice(0, PREVIEW).map((key) => (
            <li key={key} className="truncate font-mono text-xs">
              {key}
            </li>
          ))}
          {count > PREVIEW && (
            <li className="text-muted-foreground pt-1 text-xs">
              and {count - PREVIEW} more
            </li>
          )}
        </ul>

        <Label className="flex items-start gap-2 font-normal">
          <Checkbox
            className="mt-0.5"
            checked={everywhere}
            onCheckedChange={(checked) => setEverywhere(checked === true)}
          />
          <span>
            Delete in the other {others} languages too
            <span className="text-muted-foreground">
              {" "}
              — {everywhere
                ? `the ${noun} and every translation of ${them} leave this app for good.`
                : `leave this off and only ${languageName} is cleared: the ${noun} stay registered, read as missing here, and keep their text everywhere else.`}
            </span>
          </span>
        </Label>

        {/* Clearing the source language is the one scoped delete that costs
            more than it looks: the translators lose the English they work
            from, while the key stays on every list. */}
        {!everywhere && language === SOURCE_LANGUAGE && (
          <p className="text-destructive text-xs">
            {languageName} is the source language. Clearing it leaves the{" "}
            {noun} with no English text for anyone to translate from.
          </p>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            <Trash2 data-icon="inline-start" />
            {isDeleting
              ? "Deleting…"
              : everywhere
                ? `Delete everywhere`
                : `Delete in ${languageName}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
