import {
  Baby,
  Backpack,
  BellRing,
  BookOpen,
  FileText,
  GraduationCap,
  Globe,
  MailPlus,
  MessageSquarePlus,
  School,
  Smartphone,
  SquareStack,
  Users,
  type LucideIcon,
} from "lucide-react"

export type NavLeaf = {
  /** Stable id, also the URL segment: `/{section.id}/{leaf.id}`. */
  id: string
  title: string
  icon: LucideIcon
  /** Outstanding strings for the selected language - placeholder data for now. */
  count?: number
}

export type NavSection = {
  id: string
  title: string
  icon: LucideIcon
  items: NavLeaf[]
}

export const navSections: NavSection[] = [
  {
    id: "web",
    title: "Web",
    icon: Globe,
    items: [
      { id: "school", title: "School", icon: School, count: 12 },
      { id: "curriculum", title: "Curriculum", icon: BookOpen, count: 4 },
      { id: "training", title: "Training", icon: GraduationCap },
      { id: "content", title: "Content", icon: FileText, count: 27 },
    ],
  },
  {
    id: "app",
    title: "App",
    icon: Smartphone,
    items: [
      { id: "baby", title: "Baby", icon: Baby },
      { id: "parent", title: "Parent", icon: Users, count: 8 },
      { id: "student", title: "Student", icon: Backpack, count: 3 },
    ],
  },
  /**
   * Messages, not screens - and one leaf per *channel*, not per message.
   *
   * These used to be three leaves named after single mails ("Mail invite
   * user", "SMS invite user", "Mail notification"). Each of those is one
   * template among many: the same product sends an invite to a coach, a
   * teacher, a parent and a student, and they are different copy. So the leaf
   * is the format - email, SMS, notification - and the templates inside it are
   * a table. See `src/lib/template_data.ts`.
   */
  {
    id: "others",
    title: "Messages",
    icon: SquareStack,
    items: [
      { id: "email", title: "Email", icon: MailPlus },
      { id: "sms", title: "SMS", icon: MessageSquarePlus },
      { id: "notification", title: "Notification", icon: BellRing },
    ],
  },
]

export type NavMatch = {
  section: NavSection
  leaf: NavLeaf
}

/** `/web/school` - the one place a target URL is built. */
export function navPath(section: NavSection, leaf: NavLeaf) {
  return `/${section.id}/${leaf.id}`
}

export function findNavLeaf(
  sectionId?: string,
  leafId?: string
): NavMatch | null {
  const section = navSections.find((item) => item.id === sectionId)
  const leaf = section?.items.find((item) => item.id === leafId)
  return section && leaf ? { section, leaf } : null
}

/** Every leaf, flattened - the dashboard shortcut grid reads this. */
export const navLeaves: NavMatch[] = navSections.flatMap((section) =>
  section.items.map((leaf) => ({ section, leaf }))
)

/** Where the workspace opens when no target is named. */
export const defaultNavPath = navPath(navSections[0], navSections[0].items[0])
