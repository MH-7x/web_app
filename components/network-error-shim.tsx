"use client"

import { useEffect } from "react"

const MESSAGE = "Connection error. Check your internet and try again."

/** The browser's own fetch failure ("Failed to fetch") means nothing to a user, so it is reworded once here for every caller that shows error.message. */
export function NetworkErrorShim() {
  useEffect(() => {
    const original = window.fetch
    window.fetch = async (...args) => {
      try {
        return await original(...args)
      } catch (e) {
        if (e instanceof TypeError) throw new Error(MESSAGE, { cause: e })
        throw e
      }
    }
    return () => {
      window.fetch = original
    }
  }, [])
  return null
}
