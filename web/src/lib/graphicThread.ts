"use client";

// One conversation per graphic request, wherever you opened it from.
//
// The request drawer and the task card in My Tasks are two windows onto the
// same job, and they each used to keep their own idea of what had been said:
// Creative wrote a revision reason onto the request, the requester typed a
// reply into the task blob, and neither could read the other. A question could
// therefore be asked and answered without the two people ever seeing the same
// screen.
//
// Everything goes through here so a message posted from either side lands in
// graphic_feedback, reaches the person it answers, and reads the same in both
// places.

import { addGraphicFeedback } from "@/lib/db/feedback";
import { Feedback, Graphic, MESSAGE_TYPE, threadAudience } from "@/lib/data/graphic";
import { graphicTeam } from "@/lib/notifyRouting";
import { notify } from "@/lib/notify";
import { workLink } from "@/lib/deepLink";

/** Post a message on a request and tell whoever it answers.
 *
 *  Returns the stored row so the caller can show it immediately; null in demo
 *  mode, where there is nowhere to store it. Throws only if the write fails —
 *  the notification is best-effort, because a message that saved is not a
 *  message that failed.
 */
export async function postGraphicMessage(opts: {
  graphic: Graphic;
  text: string;
  me: string;
  myColor?: string;
  /** The thread as it stands, newest first — decides who the reply is for. */
  thread: Feedback[];
}): Promise<Feedback | null> {
  const text = opts.text.trim();
  if (!text) return null;
  const { graphic: g, me } = opts;
  const to = threadAudience(g, opts.thread, me);

  const saved = await addGraphicFeedback(g.id, {
    owner: me,
    team: "Conversation",
    ownerColor: opts.myColor ?? "#6C5CE7",
    type: MESSAGE_TYPE,
    text,
    // A message is not a job for anyone — leaving assignedTo blank keeps it out
    // of the revision columns that read this table.
    assignedTo: "",
  });

  // `to`, not the room: this belongs to the people on this job, and until it
  // was addressed to them the message sat on a screen they had no reason to
  // open. All of them — a Reel has a shooter, an editor, whoever drew the
  // storyboard and the person who asked for it, and a question that reaches one
  // of the four is a question the other three never saw.
  notify("mention", `💬 ${g.title}`, `${me}: ${text}`, workLink.graphic(g.id), {
    team: graphicTeam(g),
    to,
  });
  return saved;
}
