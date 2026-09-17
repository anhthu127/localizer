import { Copy } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Status = "New" | "Updated" | "Published"

type TranslationRow = {
  key: string
  source: string
  target: string
  status: Status
}

const languages = ["Vietnamese", "Japanese", "Korean", "Spanish"]

const rows: TranslationRow[] = [
  {
    key: "login.title",
    source: "Sign in to Localizer",
    target: "Đăng nhập Localizer",
    status: "Published",
  },
  {
    key: "login.forgot_password",
    source: "Forgot your password?",
    target: "Quên mật khẩu?",
    status: "Updated",
  },
  {
    key: "translations.empty_state",
    source: "No keys in this section yet.",
    target: "",
    status: "New",
  },
]

const statusVariant: Record<Status, "default" | "secondary" | "outline"> = {
  New: "default",
  Updated: "secondary",
  Published: "outline",
}

export function TranslationsPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select defaultValue="GrapeSEED App">
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GrapeSEED App">GrapeSEED App</SelectItem>
            <SelectItem value="LittleSEED App">LittleSEED App</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="Vietnamese">
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((language) => (
              <SelectItem key={language} value={language}>
                {language}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="ml-auto"
          onClick={() => toast.success("Saved 3 keys")}
        >
          Save changes
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">Key</TableHead>
              <TableHead>English</TableHead>
              <TableHead>Translation</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-mono text-xs">{row.key}</TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{row.source}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      aria-label={`Copy source of ${row.key}`}
                      onClick={() => {
                        void navigator.clipboard.writeText(row.source)
                        toast("Source copied to clipboard")
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Input defaultValue={row.target} placeholder="Add translation…" />
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[row.status]}>{row.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
