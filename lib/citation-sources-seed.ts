import type { SourceCategory, SourceType } from "@/lib/citations-types"
import type { ClientCategory } from "@/lib/constants"
import { db } from "@/lib/db"

/** The starter list of directories for UAE businesses. It is only a starting point: edit, add and delete in the Citation Sources tab. */

type Starter = {
  name: string
  url: string
  /** where a new listing is submitted; empty when not known, the site's own URL is used instead */
  submitUrl?: string
  /** nap_citation when left out */
  sourceType?: SourceType
  category: SourceCategory
  relevantFor: ("all" | ClientCategory)[]
  priority: "high" | "medium" | "low"
  isFree?: boolean
  tier: 1 | 2 | 3 | 4
  napFields?: string[]
  domainAuthority?: number
  notes?: string
}

const NAP = ["name", "address", "phone", "website"]
const RICH = [...NAP, "hours", "description", "photos"]
const VERIFY = "Check this URL is current before submitting."

const STARTER_SOURCES: Starter[] = [
  // Tier 1: must have, every client
  { name: "Google Business Profile", url: "https://www.google.com/business/", submitUrl: "https://business.google.com/create", category: "maps", relevantFor: ["all"], priority: "high", tier: 1, napFields: [...RICH, "email"], notes: "The most important listing. Verify by postcard, phone or video." },
  { name: "Bing Places", url: "https://www.bingplaces.com/", submitUrl: "https://www.bingplaces.com/", category: "maps", relevantFor: ["all"], priority: "high", tier: 1, napFields: RICH, notes: "Can import a verified Google Business Profile." },
  { name: "Apple Maps Connect", url: "https://mapsconnect.apple.com/", submitUrl: "https://mapsconnect.apple.com/", category: "maps", relevantFor: ["all"], priority: "high", tier: 1, napFields: RICH, notes: "Needs an Apple ID. Listings are reviewed before they appear." },
  { name: "Facebook Business Page", url: "https://www.facebook.com/", submitUrl: "https://www.facebook.com/pages/create", category: "social", relevantFor: ["all"], priority: "high", tier: 1, napFields: [...RICH, "email"] },
  { name: "Yellow Pages UAE", url: "https://www.yellowpages.ae/", category: "uae-local", relevantFor: ["all"], priority: "high", tier: 1, napFields: [...RICH, "email"] },
  { name: "Yelp", url: "https://www.yelp.com/", submitUrl: "https://biz.yelp.com/", category: "international", relevantFor: ["all"], priority: "high", tier: 1, napFields: RICH },

  // Tier 2: high-impact UAE directories
  { name: "Dubizzle", url: "https://www.dubizzle.com/", category: "uae-local", relevantFor: ["all"], priority: "high", tier: 2, napFields: NAP },
  { name: "Bayut", url: "https://www.bayut.com/", category: "uae-local", relevantFor: ["moving", "used_furniture"], priority: "medium", tier: 2, napFields: NAP },
  { name: "ServiceMarket", url: "https://www.servicemarket.com/", category: "uae-local", relevantFor: ["all"], priority: "high", tier: 2, napFields: NAP, notes: "Lead marketplace: partner approval is needed." },
  { name: "Connect.ae", url: "https://www.connect.ae/", category: "uae-local", relevantFor: ["all"], priority: "medium", tier: 2, napFields: NAP },
  { name: "Expatwoman Directory", url: "https://www.expatwoman.com/", category: "uae-local", relevantFor: ["all"], priority: "medium", tier: 2, napFields: NAP },
  { name: "Dubai Local", url: "https://www.dubailocal.ae/", category: "uae-local", relevantFor: ["all"], priority: "medium", tier: 2, napFields: NAP },
  { name: "Abu Dhabi Local", url: "https://www.abudhabilocal.ae/", category: "uae-local", relevantFor: ["all"], priority: "medium", tier: 2, napFields: NAP, notes: VERIFY },
  { name: "Sharjah City Guide", url: "https://www.sharjahcityguide.com/", category: "uae-local", relevantFor: ["all"], priority: "medium", tier: 2, napFields: NAP, notes: VERIFY },
  { name: "UAE Business Directory", url: "https://www.uaebusinessdirectory.com/", category: "uae-local", relevantFor: ["all"], priority: "medium", tier: 2, napFields: NAP, notes: VERIFY },
  { name: "InsyDo", url: "https://www.insydo.com/", category: "uae-local", relevantFor: ["all"], priority: "medium", tier: 2, napFields: NAP, notes: VERIFY },

  // Tier 3: industry specific
  { name: "ServiceMarket Movers", url: "https://www.servicemarket.com/", category: "industry", relevantFor: ["moving"], priority: "medium", tier: 3, napFields: NAP, notes: "The movers category on ServiceMarket." },
  { name: "Relocately", url: "https://www.relocately.com/", category: "industry", relevantFor: ["moving"], priority: "medium", tier: 3, napFields: NAP },
  { name: "MoverDB", url: "https://www.moverdb.com/", category: "industry", relevantFor: ["moving"], priority: "medium", tier: 3, napFields: NAP },
  { name: "Dubizzle Furniture", url: "https://dubai.dubizzle.com/furniture-home-garden/", category: "industry", relevantFor: ["used_furniture"], priority: "high", tier: 3, napFields: NAP, notes: "The furniture section of Dubizzle." },
  { name: "Car Rental Directories", url: "https://www.yallamotor.com/", category: "industry", relevantFor: ["pickup_rental"], priority: "medium", tier: 3, napFields: NAP, notes: "A starting point for UAE car and pickup rental directories. Add each specific directory as its own source." },

  // Tier 4: general and international
  { name: "Foursquare", url: "https://foursquare.com/", submitUrl: "https://foursquare.com/add-place", category: "international", relevantFor: ["all"], priority: "medium", tier: 4, napFields: RICH },
  { name: "TripAdvisor", url: "https://www.tripadvisor.com/", submitUrl: "https://www.tripadvisor.com/GetListedNew", category: "international", relevantFor: ["all"], priority: "low", tier: 4, napFields: RICH, notes: "Only worthwhile if the business suits travellers." },
  { name: "Hotfrog", url: "https://www.hotfrog.ae/", category: "general", relevantFor: ["all"], priority: "low", tier: 4, napFields: NAP },
  { name: "Cybo", url: "https://www.cybo.com/", category: "general", relevantFor: ["all"], priority: "low", tier: 4, napFields: NAP },
  { name: "Waze", url: "https://www.waze.com/", category: "maps", relevantFor: ["all"], priority: "low", tier: 4, napFields: NAP },
  { name: "TomTom Places", url: "https://www.tomtom.com/products/places/", category: "maps", relevantFor: ["all"], priority: "low", tier: 4, napFields: NAP, notes: VERIFY },
]

const ALL: Starter["relevantFor"] = ["all"]
const MOVING: Starter["relevantFor"] = ["moving"]
const FURNITURE: Starter["relevantFor"] = ["used_furniture"]
const RENTAL: Starter["relevantFor"] = ["pickup_rental"]
const EVERY: Starter["relevantFor"] = ["moving", "used_furniture", "pickup_rental"]
const HOME: Starter["relevantFor"] = ["moving", "used_furniture"]

/** A directory listing that is checked for name, address, phone and website. */
const nap = (name: string, host: string, tier: Starter["tier"], category: SourceCategory, relevantFor: Starter["relevantFor"], priority: Starter["priority"], notes?: string): Starter => ({
  name,
  url: `https://${host}`,
  category,
  relevantFor,
  priority,
  tier,
  napFields: NAP,
  notes,
})

/** A profile, post or ad that links to the client's site. No NAP details: only the link and whether it is live. Tier doesn't apply. */
const backlink = (name: string, host: string, domainAuthority: number, category: SourceCategory, relevantFor: Starter["relevantFor"], priority: Starter["priority"]): Starter => ({
  name,
  url: `https://${host}`,
  sourceType: "backlink",
  category,
  relevantFor,
  priority,
  tier: 4,
  napFields: [],
  domainAuthority,
})

/**
 * Added on top of the starter list. Kept apart so a database that already has sources gets these once (see `seedCitationSources`)
 * without bringing back any starter directory that was deleted on purpose.
 */
const EXPANSION_SOURCES: Starter[] = [
  // NAP citations: Tier 2 UAE directories
  nap("GetListedUAE", "getlisteduae.com", 2, "uae-local", ALL, "high"),
  nap("Yellow Pages AE", "yellowpagesae.com", 2, "uae-local", ALL, "high"),
  nap("PublikPages", "publikpages.com", 2, "uae-local", ALL, "high"),
  nap("Yello.ae", "yello.ae", 2, "uae-local", ALL, "high"),
  nap("ArabianTalks", "arabiantalks.com", 2, "uae-local", ALL, "medium"),
  nap("LaunchDubai", "launchdub.ai/directory", 2, "uae-local", ALL, "medium"),
  nap("Aiwa.ae", "aiwa.ae", 2, "uae-local", ALL, "medium"),
  nap("YallaPages", "yallapages.com", 2, "uae-local", ALL, "medium"),
  nap("Hi Dubai", "hidubai.com", 2, "uae-local", ALL, "medium"),
  nap("Cultch.co", "cultch.co", 2, "uae-local", ALL, "medium"),
  nap("Day of Dubai", "dayofdubai.com", 2, "uae-local", ALL, "medium"),
  nap("CityReach.ae", "cityreach.ae", 2, "uae-local", ALL, "medium"),
  nap("BlinxBiz", "blinxbiz.com", 2, "uae-local", ALL, "low"),
  nap("Apna Gulf", "apnagulf.com", 2, "uae-local", ALL, "low"),
  nap("CallUpContact", "callupcontact.com", 2, "uae-local", ALL, "low"),
  nap("Seller.ae", "seller.ae", 2, "uae-local", ALL, "medium", "Has a separate Arabic section: list there too if the client has an Arabic name."),
  nap("Kargal.ae", "kargal.ae", 2, "uae-local", ALL, "medium"),
  nap("Listy.ae", "listy.ae", 2, "uae-local", ALL, "medium"),
  nap("MyMidlist", "mymidlist.com", 2, "uae-local", ALL, "medium"),
  // NAP citations: Tier 3 general UAE and emirate directories
  nap("Dubai Yellow Pages Online", "dubaiyellowpagesonline.com", 3, "uae-local", EVERY, "low"),
  nap("Business Finder AE", "businessfinderae.com", 3, "uae-local", ALL, "low"),
  nap("Total Dubai", "totaldubai.com", 3, "uae-local", ALL, "low"),
  nap("Viva UAE", "vivauae.com", 3, "uae-local", ALL, "low"),
  nap("Sharjah Yellow Pages Online", "sharjahyellowpagesonline.com", 3, "uae-local", ALL, "medium"),
  // NAP citations: Tier 1
  nap("Dubai Chamber of Commerce", "dubaichamber.com", 1, "uae-local", ALL, "high", "Critical for Dubai-registered companies. Free for Chamber members."),
  // NAP citations: industry specific
  nap("iMoving", "imoving.com", 3, "industry", MOVING, "medium"),
  nap("Real Estate Club Dubai", "realestateclubdubai.com", 3, "industry", MOVING, "medium", "Has a movers directory section."),
  nap("Melltoo", "melltoo.com", 3, "industry", FURNITURE, "high"),
  nap("Homify UAE", "homify.ae", 3, "industry", FURNITURE, "medium"),
  nap("Houzz UAE", "houzz.com", 3, "industry", FURNITURE, "medium"),
  nap("OneClickDrive", "oneclickdrive.com", 3, "industry", RENTAL, "high"),
  nap("Ezhire", "ezhire.ae", 3, "industry", RENTAL, "medium"),
  // NAP citations: international
  nap("BrownBook", "brownbook.net", 4, "international", ALL, "low"),
  nap("Place123", "place123.net", 4, "international", ALL, "low"),
  nap("Kompass UAE", "ae.kompass.com", 4, "international", ALL, "medium"),
  nap("Enrollbusiness", "ae.enrollbusiness.com", 4, "international", ALL, "low"),
  nap("Bizidex", "bizidex.com", 4, "international", ALL, "low"),
  nap("Linkcentre", "linkcentre.com", 4, "international", ALL, "low"),
  nap("ProvenExpert", "provenexpert.com", 4, "international", ALL, "medium"),
  nap("TrueEN", "trueen.com", 4, "international", ALL, "low"),
  // NAP citations: maps
  nap("HERE WeGo", "wego.here.com", 4, "maps", ALL, "medium"),
  nap("MapHub", "maphub.net", 4, "maps", ALL, "low"),
  nap("ZeeMaps", "zeemaps.com", 4, "maps", ALL, "low"),

  // Backlinks: web 2.0 platforms
  backlink("WordPress.com", "wordpress.com", 94, "web2", ALL, "high"),
  backlink("Blogger", "blogger.com", 100, "web2", ALL, "high"),
  backlink("Medium", "medium.com", 96, "web2", ALL, "high"),
  backlink("Tumblr", "tumblr.com", 99, "web2", ALL, "medium"),
  backlink("LinkedIn Articles", "linkedin.com", 98, "web2", ALL, "high"),
  backlink("Notion Public Pages", "notion.so", 86, "web2", ALL, "medium"),
  backlink("Google Sites", "sites.google.com", 96, "web2", ALL, "high"),
  backlink("Pearltrees", "pearltrees.com", 85, "web2", ALL, "medium"),
  backlink("Telegraph", "telegra.ph", 84, "web2", ALL, "medium"),
  backlink("LiveJournal", "livejournal.com", 86, "web2", ALL, "low"),
  backlink("Wakelet", "wakelet.com", 74, "web2", ALL, "low"),
  backlink("Penzu", "penzu.com", 75, "web2", ALL, "low"),
  backlink("HackMD", "hackmd.io", 72, "web2", ALL, "low"),
  // Backlinks: profile creation
  backlink("Crunchbase", "crunchbase.com", 93, "profile", ALL, "high"),
  backlink("About.me", "about.me", 91, "profile", ALL, "high"),
  backlink("Gravatar", "gravatar.com", 90, "profile", ALL, "medium"),
  backlink("Behance", "behance.net", 93, "profile", ALL, "medium"),
  backlink("Pinterest", "pinterest.com", 94, "profile", ALL, "high"),
  backlink("500px", "500px.com", 84, "profile", ALL, "medium"),
  backlink("Houzz Profile", "houzz.com", 89, "profile", HOME, "high"),
  backlink("HomeTalk", "hometalk.com", 72, "profile", HOME, "medium"),
  backlink("SlideShare", "slideshare.net", 94, "profile", ALL, "high"),
  backlink("SpeakerDeck", "speakerdeck.com", 85, "profile", ALL, "medium"),
  backlink("Reddit", "reddit.com", 98, "profile", ALL, "high"),
  backlink("Diigo", "diigo.com", 91, "profile", ALL, "medium"),
  backlink("Goodreads", "goodreads.com", 93, "profile", ALL, "low"),
  backlink("Issuu", "issuu.com", 94, "profile", ALL, "medium"),
  // Backlinks: forums and Q&A
  backlink("Quora", "quora.com", 93, "forum", ALL, "high"),
  backlink("Mastodon", "mastodon.social", 83, "forum", ALL, "medium"),
  // Backlinks: classifieds
  backlink("ClassifiedAds", "classifiedads.com", 60, "classified", ALL, "low"),
  backlink("Posteezy", "posteezy.com", 48, "classified", ALL, "low"),
]

const row = (s: Starter) => ({
  name: s.name,
  url: s.url,
  submitUrl: s.submitUrl ?? "",
  sourceType: s.sourceType ?? "nap_citation",
  category: s.category,
  domainAuthority: s.domainAuthority ?? 0,
  relevantFor: JSON.stringify(s.relevantFor),
  napFields: JSON.stringify(s.napFields ?? NAP),
  isFree: s.isFree ?? true,
  priority: s.priority,
  tier: s.tier,
  notes: s.notes ?? "",
})

/** Setting that records the expansion list has been added, so a source deleted afterwards stays deleted. */
const EXPANSION_KEY = "citation_sources_expansion_v1"

/**
 * Fill the CitationSource table with the starter list when it is empty. A table that already has sources gets the expansion list
 * once, skipping any name that exists. Returns true when it added anything. Backlink domain authority is preset; NAP sources start at 0.
 */
export async function seedCitationSources() {
  const empty = (await db.citationSource.count()) === 0
  if (!empty && (await db.setting.findUnique({ where: { key: EXPANSION_KEY }, select: { key: true } }))) return false

  try {
    const have = new Set((await db.citationSource.findMany({ select: { name: true } })).map((s) => s.name))
    const wanted = (empty ? [...STARTER_SOURCES, ...EXPANSION_SOURCES] : EXPANSION_SOURCES).filter((s) => !have.has(s.name))
    if (wanted.length) await db.citationSource.createMany({ data: wanted.map(row) })
    await db.setting.upsert({ where: { key: EXPANSION_KEY }, create: { key: EXPANSION_KEY, value: new Date().toISOString() }, update: {} })
    return wanted.length > 0
  } catch (error) {
    // a second request seeded at the same moment: names are unique, so nothing was duplicated, and the next call skips what exists
    if ((await db.citationSource.count()) === 0) throw error
    return false
  }
}
