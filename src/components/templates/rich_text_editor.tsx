import { useEffect, useRef } from "react"
import {
  Bold,
  Heading,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Underline,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cleanHtml } from "@/lib/template_preview"
import { cn } from "@/lib/utils"

type RichTextEditorProps = {
  value: string
  rtl?: boolean
  ariaLabel: string
  onChange: (value: string) => void
}

/**
 * The editor for a mail body: formatting as formatting, not as angle brackets.
 *
 * A translator is not a front-end developer, and asking one to keep `<p>` pairs
 * balanced by hand is how a mail ships with the rest of its text swallowed into
 * one paragraph. So bold, italics, links and lists are buttons, and the markup
 * is this component's problem. The raw HTML is still one click away — see the
 * Source toggle on the field — because fixing a tag the editor cannot express
 * has to stay possible.
 *
 * Built on `contenteditable` and `execCommand` rather than on an editor
 * dependency. `execCommand` is deprecated and has no replacement; every browser
 * still implements it, and it buys a working editor for sixty lines against
 * ProseMirror's several hundred kilobytes. The value it produces is normalised
 * by `cleanHtml` on the way out, so what is *stored* never depends on which
 * browser typed it.
 */
export function RichTextEditor({
  value,
  rtl,
  ariaLabel,
  onChange,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  // The last value this editor itself produced. Writing the DOM on every
  // keystroke would put the caret back at the start of the field, so the value
  // is written only when it changed somewhere else — a copy-English click, or
  // a different template opening.
  const emitted = useRef<string | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || value === emitted.current) {
      return
    }
    element.innerHTML = value
    emitted.current = value
  }, [value])

  useEffect(() => {
    // Without this, Enter makes a <div> in Chrome and Safari.
    document.execCommand("defaultParagraphSeparator", false, "p")
  }, [])

  const emit = () => {
    const element = ref.current
    if (!element) {
      return
    }
    const next = cleanHtml(element.innerHTML)
    emitted.current = next
    onChange(next)
  }

  const run = (command: string, argument?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, argument)
    emit()
  }

  // The mail carries its own heading inside the body, so the block format has
  // to be reachable: toggling, because a translator who made one line a
  // heading by mistake has no other way back to a paragraph.
  const heading = () => {
    const current = document.queryCommandValue("formatBlock").toLowerCase()
    run("formatBlock", current === "h1" ? "<p>" : "<h1>")
  }

  const link = () => {
    // A prompt rather than an inline popover: focusing an input collapses the
    // selection `createLink` needs. `translations_page.tsx` asks about deleting
    // a key the same way.
    const url = window.prompt(
      "Link address — a URL, or a placeholder such as {link}"
    )
    if (url) {
      run("createLink", url)
    }
  }

  return (
    <div className="rounded-md border">
      <div className="bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
        <Tool label="Bold" onClick={() => run("bold")}>
          <Bold className="size-3.5" />
        </Tool>
        <Tool label="Italic" onClick={() => run("italic")}>
          <Italic className="size-3.5" />
        </Tool>
        <Tool label="Underline" onClick={() => run("underline")}>
          <Underline className="size-3.5" />
        </Tool>
        <span className="bg-border mx-1 h-4 w-px" />
        <Tool label="Heading" onClick={heading}>
          <Heading className="size-3.5" />
        </Tool>
        <Tool label="Bulleted list" onClick={() => run("insertUnorderedList")}>
          <List className="size-3.5" />
        </Tool>
        <Tool label="Numbered list" onClick={() => run("insertOrderedList")}>
          <ListOrdered className="size-3.5" />
        </Tool>
        <span className="bg-border mx-1 h-4 w-px" />
        <Tool label="Add link" onClick={link}>
          <Link2 className="size-3.5" />
        </Tool>
        <Tool label="Remove link" onClick={() => run("unlink")}>
          <Link2Off className="size-3.5" />
        </Tool>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        dir={rtl ? "rtl" : undefined}
        onInput={emit}
        onBlur={emit}
        // Formatted text pasted from a mail client brings a kilobyte of Word
        // markup with it. Only the words are wanted.
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData("text/plain")
          document.execCommand("insertText", false, text)
          emit()
        }}
        className={cn(
          "min-h-52 overflow-auto px-3 py-2 text-sm leading-relaxed outline-none",
          "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
          "[&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_h1]:mb-3 [&_h1]:text-base [&_h1]:font-semibold",
          "[&_p]:mb-3 [&_p:last-child]:mb-0",
          "[&_strong]:font-semibold [&_em]:italic",
          "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5",
          "empty:before:text-muted-foreground empty:before:content-['Add_translation…']"
        )}
      />
    </div>
  )
}

function Tool({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label={label}
      title={label}
      // The selection has to survive the click, and focusing a button clears it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
