import { BellRing, KeyRound, Mail, MessageSquare, Type } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  kindLabel,
  type ContentKind,
  type TargetProfile,
} from "@/config/target_profiles"
import { effectiveLengthBudget } from "@/lib/validation"

const kindIcon: Record<ContentKind, typeof Type> = {
  ui: Type,
  email: Mail,
  sms: MessageSquare,
  notification: BellRing,
}

/**
 * The empty state for an app with no keys yet - nine of the ten, until someone
 * adds one or imports a bundle.
 *
 * Borrowing School's 3,339 keys would look like a working feature and be a
 * lie: each app is its own namespace. This states what the app is for, so
 * whoever adds the first key knows what register to write in.
 */
export function TargetProfileCard({
  title,
  profile,
  action,
}: {
  title: string
  profile: TargetProfile
  /** The add-key trigger, so the empty state is also the way out of it. */
  action?: React.ReactNode
}) {
  const KindIcon = kindIcon[profile.kind]

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            No keys in {title} yet
          </CardTitle>
          <CardDescription>
            {profile.note} Add the first key below - it is created in this app
            only, and in every language at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <Field label="Content kind">
            <span className="flex items-center gap-1.5">
              <KindIcon className="size-3.5" />
              {kindLabel[profile.kind]}
            </span>
          </Field>
          <Field label="Audience">{profile.audience}</Field>
          <Field label="Tone">{profile.tone}</Field>
          <Field label="Length budget">
            Warn past {effectiveLengthBudget(profile.lengthBudget)}× the English length
            {profile.maxLength
              ? `, hard limit ${profile.maxLength.toLocaleString()} characters`
              : ""}
          </Field>
          <Field label="Profile">
            <Badge variant={profile.measured ? "outline" : "secondary"}>
              {profile.measured ? "Measured" : "Inferred"}
            </Badge>
          </Field>
          {action && <div className="flex pt-1">{action}</div>}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </span>
      <span>{children}</span>
    </div>
  )
}
