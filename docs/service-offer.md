# Service offer and call requests

`/work` is the public service offer. The homepage dashboard and terminal link to it.
Prices, scope, and the contact email live in `src/lib/work_plans.ts`.

The call request form validates the visitor's details and builds an email draft. It does not store personal information, send messages automatically, or reserve a calendar slot. Visitors send the draft through their email app, or copy it into webmail. Calls are confirmed personally by email. The submit button stays disabled until the script is ready; direct email remains available without JavaScript.

Direct booking uses `https://cal.com/wachaa/30min` from `workMeta.bookingUrl`. To override the scheduling link, set `PUBLIC_BOOKING_URL` to your real HTTPS scheduling link in the hosting environment, then rebuild. Primary calls to action open the calendar in a new tab. An optional email brief remains available. Never put secrets in this public variable. Confirm your calendar availability and meeting duration match the page's 30-minute introduction before enabling it.

Top of the Rank is described as an implementation example, with a link to the existing illustrative visual demo. No client sales outcomes or launch completion are claimed.

## Responsive verification (2026-10-22)

- Browser layout sweep: 280, 320, 360, 390, 430, 600, 640, 641, 768, 820, 900, 1024, 1100, 1280, 1440, 1920 and 2560 CSS pixels wide, plus 844×390 landscape. No horizontal overflow or out-of-bounds main content.
- Calendar link opened in a new tab and resolved to “30 Min Meeting | Bunyasit Fang | Cal.com”. No appointment was booked.
- Homepage dashboard stacks inside narrow containers; mobile workspace selection survives resize. Desktop canvas preserves its center after resize.
- Selecting a service opens the optional brief and preselects the service. Its email draft uses the 30-minute duration.
- Production build passes. The local Node 25 runtime produces the existing Vercel warning; deployment output targets Node 24.
