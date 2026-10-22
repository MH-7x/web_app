import { renderFacebookText } from "@/lib/ads-types"
import type { ClientDetail } from "@/lib/clients"
import { renderText } from "@/lib/content-types"
import { generateFacebookAds } from "@/lib/generators/ads"
import { generateBlog, generateFAQ, generateGBP, generateMeta } from "@/lib/generators/content"
import { writePosts } from "@/lib/generators/gbp-posts"
import { humanizeContent, scoreContent } from "@/lib/generators/humanizer"
import { generateReport } from "@/lib/generators/reports"
import { dateKey } from "@/lib/gbp-posts-types"
import { parseMonth } from "@/lib/reports-types"
import type { TemplateName } from "@/lib/prompts/templates"

/** A made-up client used by "Test with sample client". It is never saved. */
export const SAMPLE_CLIENT: ClientDetail = {
  id: "sample",
  name: "Al Noor Movers",
  nameAr: "النور لنقل الأثاث",
  slug: "al-noor-movers",
  category: "moving",
  emirate: "Sharjah",
  emiratesServed: ["Dubai", "Ajman"],
  areas: ["Al Majaz", "Al Nahda", "Muwaileh"],
  services: ["Villa Moving", "Apartment Relocation", "Packing & Unpacking"],
  phone: "+971501234567",
  whatsapp: "+971501234567",
  website: "https://alnoormovers.example",
  primaryColor: "#0f766e",
  secondaryColor: "#e2e8f0",
  truckType: "3-ton closed box truck, white with teal lettering",
  uniform: "teal polo shirts and dark trousers",
  initialSetup: [],
  tones: ["Professional", "Trustworthy"],
  notes: "",
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

const SAMPLE_TEXT =
  "Al Noor Movers is a leading moving company in Sharjah, nestled in the heart of the community. We boast a vibrant team of experienced professionals who utilize state-of-the-art equipment, ensuring a seamless relocation experience. It's not just a move, it's a testament to our commitment to excellence. Call +971 50 123 4567 today!"

const list = (items: { question: string; answer: string }[]) => items.map((f, i) => `${i + 1}. ${f.question}\n${f.answer}`).join("\n\n")

/** Run the real generator for a template, kept small, against the sample client. The result is plain text for the preview. */
export async function runSample(name: TemplateName): Promise<string> {
  const c = SAMPLE_CLIENT
  switch (name) {
    case "gbp-description":
      return (await generateGBP(c, "en", { highlights: ["Licensed & insured", "Free moving estimates"], maxChars: 750 })).en ?? ""
    case "faq-generation":
      return list((await generateFAQ(c, "en", { count: 3, topic: "" })).en ?? [])
    case "blog-post": {
      const post = (await generateBlog(c, "en", { topic: "How to prepare for a villa move in summer", keyword: "villa movers in Sharjah", wordCount: 500 })).en
      return post ? renderText("blog", post) : ""
    }
    case "meta-tags":
      return renderText("meta", (await generateMeta(c, "en", { pages: ["home", "services"] })).en ?? [])
    case "fb-ad": {
      const result = await generateFacebookAds(c, "en", { emirates: ["Sharjah"], objective: "messages", offer: "", audience: "", count: 2 })
      return result.en ? renderFacebookText(result.en) : ""
    }
    case "gbp-posts": {
      const posts = await writePosts(c, [{ date: dateKey(new Date()), category: "customer-tip", service: c.services[0], area: c.areas[0], keywords: ["villa movers Sharjah", "packing service"] }], "en")
      return posts.map((p) => `${p.textEn}\n\nCTA: ${p.cta}\nImage prompt: ${p.imagePrompt}`).join("\n\n")
    }
    case "humanizer":
      return `Before:\n${SAMPLE_TEXT}\n\nAfter:\n${await humanizeContent(SAMPLE_TEXT, "medium")}`
    case "humanizer-scorer":
      return `Sample text:\n${SAMPLE_TEXT}\n\nAI-detection score: ${await scoreContent(SAMPLE_TEXT)} / 100`
    case "report": {
      const r = await generateReport(c, parseMonth("2026-09"), { impressions: 24500, clicks: 1230, gbpViews: 8340, gbpCalls: 47, adSpend: 3200, conversions: 38 }, { impressions: 20760, clicks: 1098, gbpCalls: 35, adSpend: 3000, conversions: 30 })
      return [r.summary, "Wins:\n" + r.wins.map((w) => `- ${w}`).join("\n"), "Areas to improve:\n" + r.improvements.map((w) => `- ${w}`).join("\n"), "Recommendations:\n" + r.recommendations.map((w) => `- ${w}`).join("\n")].join("\n\n")
    }
  }
}
