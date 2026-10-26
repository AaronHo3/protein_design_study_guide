import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Session details live in the `?session=` query param so any screen can open them. */
export function useOpenSession() {
  const [params, setParams] = useSearchParams()
  const open = useCallback(
    (id: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('session', id)
          else next.delete('session')
          return next
        },
        { replace: false },
      )
    },
    [setParams],
  )
  return { openId: params.get('session'), open }
}
