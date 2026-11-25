/**
 * What anyone who writes to us is told will happen, in the same words
 * everywhere: the feedback door, /contact, the guides and the API's own
 * documents. It is an aim to read. It promises no answer, no time for one and
 * no email. The contact form runs in the browser and imports this file, so
 * nothing that needs a server belongs in it.
 */

export const FEEDBACK_READ_AIM_HOURS = 48;
export const FEEDBACK_READ_AIM = `We aim to read every message within ${FEEDBACK_READ_AIM_HOURS} hours.`;
/** The same aim for people, on /contact. */
export const CONTACT_FORM_READ_AIM = `We aim to read every message sent with this form within ${FEEDBACK_READ_AIM_HOURS} hours.`;

/** Where an answer to a message sent through the door is, and is not. */
export const FEEDBACK_ANSWER_PLACE = "The answer is shown to whoever holds the message's key. Nothing is emailed automatically.";
