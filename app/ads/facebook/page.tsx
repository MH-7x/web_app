import { redirect } from "next/navigation"

/** Old links point here; Facebook Ads now lives on /ads. */
export default function FacebookAdsRedirect() {
  redirect("/ads")
}
