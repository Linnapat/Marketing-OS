// Mood & Metrics closed per CMO (18 Jul 2026): the dashboard duplicated
// numbers that live in Campaign Café / Performance Center, so "/" now sends
// everyone to the real front door instead of rendering a parallel summary.
// The old dashboard lives in git history if it's ever wanted back.

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/campaigns");
}
