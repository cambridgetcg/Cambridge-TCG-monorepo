/**
 * What anyone who writes to the feedback door is told will happen: the words
 * of the door's receipt, /contact, the published example, and the guides and
 * documents that signposts.test.ts lists. Other pages have their own. It is an
 * aim to read, for the door's messages only. It promises no answer, no time for
 * one and no email. Where only the mailbox is offered, the address stands
 * alone. The contact form runs in the browser and imports this file, so nothing
 * that needs a server belongs in it.
 */

export const FEEDBACK_READ_AIM_HOURS = 48;
/** For programs, naming the door, since an address often stands beside it. */
export const FEEDBACK_READ_AIM = `We aim to read every message sent to /api/v1/feedback within ${FEEDBACK_READ_AIM_HOURS} hours.`;
/** The same aim for people, on /contact. */
export const CONTACT_FORM_READ_AIM = `We aim to read every message sent with this form within ${FEEDBACK_READ_AIM_HOURS} hours.`;

/** Where an answer to a message sent through the door is, and is not. */
export const FEEDBACK_ANSWER_PLACE = "An answer, if one is written, is shown to whoever holds the message's key. No answer is emailed automatically.";

/** The door can be closed, and its own GET says so. For documents that show
 * what to send. */
export const FEEDBACK_OPEN_CHECK = "GET /api/v1/feedback says whether it is taking messages.";
