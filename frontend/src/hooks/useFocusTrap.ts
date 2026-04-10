import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Traps keyboard focus inside a container while active.
 * Also closes on Escape and restores focus to the trigger element on close.
 */
export function useFocusTrap(active: boolean, onClose?: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    // Save the element that had focus before the modal opened
    previousFocus.current = document.activeElement as HTMLElement

    // Focus the first focusable element inside the trap
    const focusable = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    focusable?.[0]?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return

      const elements = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!elements.length) return

      const first = elements[0]
      const last = elements[elements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the trigger element when the modal closes
      previousFocus.current?.focus()
    }
  }, [active, onClose])

  return ref
}
