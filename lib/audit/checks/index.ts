import { checks as crawlHealth } from "@/lib/audit/checks/crawlhealth"
import { checks as geo } from "@/lib/audit/checks/geo"
import { checks as links } from "@/lib/audit/checks/links"
import { checks as local } from "@/lib/audit/checks/local"
import { checks as multilingual } from "@/lib/audit/checks/multilingual"
import { checks as onPage } from "@/lib/audit/checks/onpage"
import { checks as performance } from "@/lib/audit/checks/performance"
import { checks as social } from "@/lib/audit/checks/social"
import { checks as technology } from "@/lib/audit/checks/technology"
import { checks as usability } from "@/lib/audit/checks/usability"
import type { CheckDef } from "@/lib/audit/checks/util"

/** Every check, in the order they appear in reports. Add a file under checks/ and list it here to add checks. */
export const ALL_CHECKS: CheckDef[] = [...onPage, ...geo, ...links, ...usability, ...performance, ...social, ...local, ...technology, ...multilingual, ...crawlHealth]
