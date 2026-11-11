import { useEffect } from 'react'

// Press feedback belongs to pointer input; keyboard navigation stays immediate.
export default function InputMode() {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.input = 'keyboard'
    const pointer = () => { root.dataset.input = 'pointer' }
    const keyboard = () => { root.dataset.input = 'keyboard' }
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
      delete root.dataset.input
    }
  }, [])
  return null
}
