import { ChevronLeft, Mail, MoreVertical, Reply, Star } from "lucide-react"

import type { TemplateChannel, TemplateFieldId } from "@/lib/template_data"
import { previewHtml, previewText, sampleValues } from "@/lib/template_preview"
import { cn } from "@/lib/utils"
import { smsInfo } from "@/lib/validation"

type TemplatePreviewProps = {
  channel: TemplateChannel
  /** Field id → the text to render, already in the language being previewed. */
  values: Partial<Record<TemplateFieldId, string>>
  /** The sending product, for the chrome's app name. */
  appName: string
  rtl?: boolean
}

/**
 * The message as its reader gets it.
 *
 * Three chromes, because the thing that breaks is different in each: an email
 * breaks in its markup and its button width, an SMS breaks at a segment
 * boundary, and a notification breaks by being truncated on a lock screen. A
 * plain textarea shows none of those; `docs/target_apps_ui.md` §5.2 asks for
 * exactly this pane.
 *
 * Placeholders are filled from `lib/template_preview.ts` with samples longer
 * than the English words they replace — a real name is where a subject line
 * actually overflows, and `{name}` would never show that.
 */
export function TemplatePreview({
  channel,
  values,
  appName,
  rtl,
}: TemplatePreviewProps) {
  return (
    <div dir={rtl ? "rtl" : undefined} className="flex flex-col gap-3">
      {channel === "email" && <EmailPreview values={values} />}
      {channel === "sms" && (
        <SmsPreview values={values} appName={appName} rtl={rtl} />
      )}
      {channel === "notification" && (
        <NotificationPreview values={values} appName={appName} />
      )}
    </div>
  )
}

type PreviewProps = {
  values: Partial<Record<TemplateFieldId, string>>
}

/** An empty field previews as its own name in grey, not as a hole. */
function Placeholder({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground/60 italic">
      {label} not translated yet
    </span>
  )
}

function EmailPreview({ values }: PreviewProps) {
  const subject = values.subject ?? ""
  const preheader = values.preheader ?? ""
  const heading = values.heading ?? ""
  const body = values.body ?? ""
  const cta = values.cta ?? ""
  const footer = values.footer ?? ""

  return (
    <>
      {/* The inbox line: what decides whether the mail is opened at all. */}
      <div className="bg-muted/40 rounded-lg border p-3">
        <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wide uppercase">
          In the inbox
        </p>
        <div className="flex items-start gap-2">
          <Mail className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {subject ? previewText(subject) : <Placeholder label="Subject" />}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {preheader ? (
                previewText(preheader)
              ) : (
                <Placeholder label="Preheader" />
              )}
            </p>
          </div>
        </div>
      </div>

      {/* The mail itself, in a mail-client frame. */}
      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/40 flex items-center gap-2 border-b px-3 py-2">
          <ChevronLeft className="text-muted-foreground size-4" />
          <div className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-full text-[10px] font-semibold">
            GS
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium">GrapeSeed Support</p>
            <p className="text-muted-foreground truncate">
              to {sampleValues["{email}"]}
            </p>
          </div>
          <Star className="text-muted-foreground size-3.5" />
          <Reply className="text-muted-foreground size-3.5" />
          <MoreVertical className="text-muted-foreground size-3.5" />
        </div>

        <div className="bg-background px-5 py-5">
          <h3 className="text-base font-semibold">
            {heading ? previewText(heading) : <Placeholder label="Heading" />}
          </h3>

          {body ? (
            <div
              className="mt-3 text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l [&_blockquote]:pl-3 [&_em]:italic [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-medium [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_small]:text-xs [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
              // Safe by construction: `previewHtml` escapes the value and then
              // reintroduces only a whitelist of tags it builds itself, so a
              // bundle cannot put markup of its own into this document.
              // See `lib/template_preview.ts`.
              dangerouslySetInnerHTML={{ __html: previewHtml(body) }}
            />
          ) : (
            <p className="mt-3 text-sm">
              <Placeholder label="Body" />
            </p>
          )}

          <div className="mt-5">
            <span className="bg-primary text-primary-foreground inline-flex max-w-full items-center rounded-md px-4 py-2 text-sm font-medium">
              <span className="truncate">
                {cta ? previewText(cta) : "Button label"}
              </span>
            </span>
          </div>

          <p className="text-muted-foreground mt-5 border-t pt-3 text-xs leading-relaxed">
            {footer ? previewText(footer) : <Placeholder label="Footer" />}
          </p>
        </div>
      </div>
    </>
  )
}

/**
 * A phone message thread, plus the segment split spelled out: where the
 * message breaks, and what it costs, is the entire reason this channel has its
 * own screen.
 */
function SmsPreview({
  values,
  appName,
  rtl,
}: PreviewProps & { appName: string; rtl?: boolean }) {
  const message = previewText(values.message ?? "")
  const info = smsInfo(message)
  const capacity = info.encoding === "GSM-7" ? 153 : 67
  const parts =
    info.segments > 1
      ? chunk(message, capacity)
      : message
        ? [message]
        : []

  return (
    <>
      <div className="mx-auto w-full max-w-xs rounded-[1.75rem] border-4 border-foreground/15 bg-muted/30 p-3">
        <p className="text-muted-foreground mb-3 text-center text-xs font-medium">
          {appName}
        </p>
        {parts.length === 0 ? (
          <p className="text-center text-xs">
            <Placeholder label="Message" />
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {parts.map((part, index) => (
              <div
                key={index}
                className="bg-background max-w-[85%] rounded-2xl rounded-bl-sm border px-3 py-2 text-sm break-words shadow-sm"
              >
                {part}
                {parts.length > 1 && (
                  <span className="text-muted-foreground mt-1 block text-[10px]">
                    part {index + 1} of {parts.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <dl
        dir={rtl ? "ltr" : undefined}
        className="grid grid-cols-3 gap-2 text-center"
      >
        <Stat label="Encoding" value={info.encoding} />
        <Stat label="Billed chars" value={String(info.units)} />
        <Stat
          label="Segments"
          value={String(info.segments)}
          warn={info.segments > 1}
        />
      </dl>
      <p className="text-muted-foreground text-xs">
        A segment holds {info.encoding === "GSM-7" ? "160" : "70"} characters in{" "}
        {info.encoding}, and {capacity} once the message splits — each part
        carries a concatenation header.
      </p>
    </>
  )
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="rounded-lg border p-2">
      <dt className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono text-sm tabular-nums",
          warn && "text-amber-600 dark:text-amber-500"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * A lock screen, and the same notification collapsed.
 *
 * The collapsed form is the one that matters: a title over its budget is cut
 * off there, and a translation 1.9× the English length is where that happens.
 */
function NotificationPreview({
  values,
  appName,
}: PreviewProps & { appName: string }) {
  const title = previewText(values.title ?? "")
  const body = previewText(values.body ?? "")

  return (
    <>
      <div className="from-primary/20 via-muted to-muted/40 mx-auto w-full max-w-xs rounded-[1.75rem] border-4 border-foreground/15 bg-gradient-to-b p-3">
        <p className="text-muted-foreground mt-2 mb-4 text-center text-4xl font-light tabular-nums">
          9:41
        </p>
        <div className="bg-background/90 rounded-2xl border p-3 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded text-[9px] font-bold">
              GS
            </div>
            <span className="text-muted-foreground flex-1 truncate text-[10px] font-medium uppercase">
              {appName}
            </span>
            <span className="text-muted-foreground text-[10px]">now</span>
          </div>
          <p className="mt-1.5 line-clamp-1 text-sm font-semibold">
            {title || <Placeholder label="Title" />}
          </p>
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {body || <Placeholder label="Body" />}
          </p>
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wide uppercase">
          Expanded
        </p>
        <p className="text-sm font-semibold">
          {title || <Placeholder label="Title" />}
        </p>
        <p className="text-muted-foreground text-sm">
          {body || <Placeholder label="Body" />}
        </p>
      </div>
    </>
  )
}

/** Splits a message the way a carrier does — by characters, not by words. */
function chunk(value: string, size: number): string[] {
  const parts: string[] = []
  const characters = [...value]

  for (let index = 0; index < characters.length; index += size) {
    parts.push(characters.slice(index, index + size).join(""))
  }

  return parts
}
