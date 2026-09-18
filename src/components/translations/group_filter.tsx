import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { GroupOption } from "@/lib/locale_data"

export const ALL_GROUPS = "__all__"

type GroupFilterProps = {
  value: string
  options: GroupOption[]
  totalKeys: number
  onChange: (group: string) => void
}

/** 156 group keys is too many for a plain select — searchable combobox instead. */
export function GroupFilter({
  value,
  options,
  totalKeys,
  onChange,
}: GroupFilterProps) {
  const [open, setOpen] = useState(false)

  const select = (group: string) => {
    onChange(group)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className="w-56 justify-between font-normal">
            <span className="truncate">
              {value === ALL_GROUPS ? "All groups" : value}
            </span>
            <ChevronsUpDown className="text-muted-foreground size-4" />
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Filter group key…" />
          <CommandList>
            <CommandEmpty>No group found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all groups" onSelect={() => select(ALL_GROUPS)}>
                <Check
                  className={cn(
                    "size-4",
                    value === ALL_GROUPS ? "opacity-100" : "opacity-0"
                  )}
                />
                <span>All groups</span>
                <Badge variant="outline" className="ml-auto">
                  {totalKeys}
                </Badge>
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.group}
                  value={option.group}
                  onSelect={() => select(option.group)}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === option.group ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate font-mono text-xs">
                    {option.group}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {option.outstanding > 0 && (
                      <Badge variant="secondary">{option.outstanding}</Badge>
                    )}
                    <Badge variant="outline">{option.total}</Badge>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
