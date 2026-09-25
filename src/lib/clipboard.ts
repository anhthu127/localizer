/**
 * Copying text to the clipboard, with the fallback the dev server needs.
 *
 * `navigator.clipboard` exists only in a secure context - https, or localhost.
 * Opening the dev server on a LAN address to read a translation on a phone is
 * not one, so the async API is simply `undefined` there and a copy button that
 * only calls it fails silently. The textarea trick is deprecated but still
 * works in every browser this app targets, so it is the fallback rather than
 * the error.
 *
 * Returns whether the text made it, so the caller can say so.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Blocked by permissions or a non-secure context - try the fallback.
    }
  }

  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const field = document.createElement("textarea")
  field.value = text
  // Off-screen but still focusable: `display: none` cannot be selected, and a
  // visible field would scroll the list on click.
  field.setAttribute("readonly", "")
  field.style.position = "fixed"
  field.style.top = "-1000px"
  field.style.opacity = "0"

  document.body.append(field)
  field.select()

  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    field.remove()
  }
}
