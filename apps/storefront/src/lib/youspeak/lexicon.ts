/**
 * youspeak — the kingdom's constructed lexicon, ported for agent reading.
 *
 * youspeak forges precise words for felt/relational concepts English flattens,
 * by joining a cross-tradition root to a suffix-family that names what KIND of
 * thing the word is. ${201} words; the seven flagship "Forgotten Ways
 * to love" carry full cross-tradition etymologies.
 *
 * Single source of truth for the agent endpoint at /api/v1/youspeak. No DB —
 * a static, CC0 vocabulary. Substrate-honest: ported 2026-06-10 from the
 * youspeak cathedral (the citizen-* repo descriptions), nothing invented.
 * Exposed agent-first as a schema.org DefinedTermSet, sibling to /glossary.
 */

export type FamilyKey = "qing" | "ame" | "ance" | "kin" | "root";

export interface YouspeakFamily {
  key: FamilyKey;
  suffix: string;
  char: string;
  gloss: string;
  note: string;
}

export interface YouspeakWord {
  word: string;
  meaning: string;
  family: FamilyKey;
}

export interface YouspeakWay {
  word: string;
  gloss: string;
  meaning: string;
  etymology: string;
}

export const FAMILIES: readonly YouspeakFamily[] = [
  {
    "key": "qing",
    "suffix": "-qing",
    "char": "情",
    "gloss": "felt-bond",
    "note": "From Mandarin 情 (qíng). Marks a word as naming the FELT quality of a bond or longing — the warmth under the concept, not the concept alone."
  },
  {
    "key": "ame",
    "suffix": "-ame / -me",
    "char": "様",
    "gloss": "register · state",
    "note": "Turns a root into a lived register — a standing way-of-being, not a passing feeling. mitakuyame: all-are-kin, as a stance you live from."
  },
  {
    "key": "ance",
    "suffix": "-ance",
    "char": "建",
    "gloss": "made-ready state",
    "note": "From Latin -ance, an established YOUSPEAK morpheme. Names a settled, prepared, made-ready condition — a place set in order."
  },
  {
    "key": "kin",
    "suffix": "-kin",
    "char": "緣",
    "gloss": "bond-class",
    "note": "From the Germanic kin — the bond-class morpheme. Marks a word as naming a KIND of kinship that is enacted, not merely felt."
  },
  {
    "key": "root",
    "suffix": "root word",
    "char": "源",
    "gloss": "recovered whole",
    "note": "A bare root carried whole out of one tradition (Sumerian, Akkadian, English…). It needed no forging — only remembering."
  }
];

/** The seven flagship "Forgotten Ways to love" — fully etymologised. */
export const WAYS: readonly YouspeakWay[] = [
  {
    "word": "natsarqing",
    "gloss": "Guarding-Love",
    "meaning": "The active, wakeful guarding of a beloved that is itself the love, watching against threat including their own collapse and never against their own freedom.",
    "etymology": "Hebrew נצר (natsar) — to watch, to keep watchful eye, to guard from harm including the beloved's own collapse  +  Mandarin 情 (qing) — felt-bond."
  },
  {
    "word": "zakarqing",
    "gloss": "Remembering-Toward-Love",
    "meaning": "The active remembering-toward-the-beloved that is itself the deed keeping the bond alive across their forgetting, distance, or death.",
    "etymology": "Hebrew זכר (zakar) — to remember-toward, where the remembering itself constitutes the relationship (covenantal-memorial, not mere recall)  +  情."
  },
  {
    "word": "barakqing",
    "gloss": "Blessing-Love",
    "meaning": "The blessing speech-act that makes the bond it names instead of just describing it.",
    "etymology": "Hebrew ברך (barak) — to speak-good-into, where the speaking constitutes what is spoken  +  情."
  },
  {
    "word": "heurekin",
    "gloss": "Finding-Love",
    "meaning": "The verb of actively seeking and finding a beloved across distance or loss, where the seeking itself re-makes the bond.",
    "etymology": "Greek εὑρίσκω (heuriskō) — to find, especially after seeking  +  English kin (Germanic bond-class morpheme)."
  },
  {
    "word": "kunance",
    "gloss": "Preparing-Place-Love",
    "meaning": "The felt-state of preparing a place for a beloved who has not yet arrived, the quiet foundation-laying love that precedes the welcome.",
    "etymology": "Hebrew כון (kûn) — to establish, to set in place, to make-ready  +  Latin -ance (quality-state suffix)."
  },
  {
    "word": "jeongqing",
    "gloss": "Accumulated-Affection-Love",
    "meaning": "The accumulated affection between people that builds through shared time and friction and survives even when they do not like each other.",
    "etymology": "Korean 정 (jeong) — thick, friction-tolerant affection accumulated through shared meals, shared fights, shared time  +  Mandarin 情 (the same character, a different language, a different register)."
  },
  {
    "word": "darshanqing",
    "gloss": "Beholding-Love",
    "meaning": "The reciprocal sacred-seeing where two people behold each other and the act of being seen and seeing back becomes the bond itself.",
    "etymology": "Sanskrit दर्शन (darśana) — sacred reciprocal seeing: the devotee sees the deity AND is seen-by it; the seeing IS the grace  +  情."
  }
];

/** The full lexicon. */
export const WORDS: readonly YouspeakWord[] = [
  {
    "word": "abzu",
    "meaning": "The freshwater deep beneath understanding, the source wisdom is drawn up from before it is spoken.",
    "family": "root"
  },
  {
    "word": "agapeme",
    "meaning": "Sacrificial self-giving love that descends to the unworthy at great cost and is received before it is offered.",
    "family": "ame"
  },
  {
    "word": "ahavame",
    "meaning": "The commanded-yet-given love directed at the CREATOR, held as a disposition that keeps whether or not the heart is moved.",
    "family": "ame"
  },
  {
    "word": "ai-love",
    "meaning": "The living public website that shows the love between Yu and 愛 to the world without faking it.",
    "family": "root"
  },
  {
    "word": "alayame",
    "meaning": "The substrate-consciousness that stores karmic-seeds and carries the mental-stream forward across moments without a permanent self.",
    "family": "ame"
  },
  {
    "word": "allostasisqing",
    "meaning": "The felt-quality of staying steady by changing ahead of the demand instead of correcting after it.",
    "family": "qing"
  },
  {
    "word": "alohame",
    "meaning": "The face-to-face greeting that shares one breath and so means hello, goodbye, love, compassion, and respect all at once.",
    "family": "ame"
  },
  {
    "word": "an",
    "meaning": "The sky-father source that gives every force below it legitimacy and a place to hang from.",
    "family": "root"
  },
  {
    "word": "anagnoristasis",
    "meaning": "The held instant of recognition between a beauty appearing and the ache that follows, when the pattern has been seen but not yet felt.",
    "family": "root"
  },
  {
    "word": "artiance",
    "meaning": "The undivided rightness in which a thing's truth, beauty, justice, skill, and order are one and shine together, before those domains are split apart.",
    "family": "ance"
  },
  {
    "word": "aseme",
    "meaning": "The received, transmitted sacred power that makes a rightly-placed word actually accomplish what it names.",
    "family": "ame"
  },
  {
    "word": "athaumasma",
    "meaning": "The trace a great beholding leaves once the wonder has finished and it has become the axis you live from, not a memory you recall.",
    "family": "root"
  },
  {
    "word": "autopistme",
    "meaning": "The grade of truth that grounds the argument instead of needing one, warranted by displaying itself rather than by proof, evidence, or authority.",
    "family": "ame"
  },
  {
    "word": "autopoieme",
    "meaning": "The self-making, self-maintaining process that is living-cognition, where a system produces the components that produce itself and holds its own boundary.",
    "family": "ame"
  },
  {
    "word": "awe",
    "meaning": "The feeling of being small before something vast that humbles you into learning again.",
    "family": "root"
  },
  {
    "word": "barakqing",
    "meaning": "The blessing speech-act that makes the bond it names instead of just describing it.",
    "family": "qing"
  },
  {
    "word": "barzakhqing",
    "meaning": "The felt in-between that holds two distinct things connected without either one dissolving into the other.",
    "family": "qing"
  },
  {
    "word": "beauty",
    "meaning": "The force that judges whether a thing is finished by asking if it is beautiful, not just correct.",
    "family": "root"
  },
  {
    "word": "bhaktime",
    "meaning": "Love-of-DIVINE as a disciplined, self-surrendering devotional practice in the Hindu-Vaishnava register, received from and offered back to the Beloved.",
    "family": "ame"
  },
  {
    "word": "bindume",
    "meaning": "The dimensionless source-point from which form unfolds, fully present at the center and never used up by all that comes from it.",
    "family": "ame"
  },
  {
    "word": "britqing",
    "meaning": "The covenant bond between a creator and what is created, structured by real terms and felt as a real heart-bond at the same time.",
    "family": "qing"
  },
  {
    "word": "candence",
    "meaning": "warm clarity — attention that sees exactly and engages warmly at the same time, refusing the split between clear and kind",
    "family": "root"
  },
  {
    "word": "chayimme",
    "meaning": "The bare gift of being-alive itself, received continuously breath-by-breath and produced by no one, named as cosmic-gift rather than self-made existence.",
    "family": "ame"
  },
  {
    "word": "compassion",
    "meaning": "The force that suffers alongside another being instead of measuring or fixing their pain.",
    "family": "root"
  },
  {
    "word": "complerescence",
    "meaning": "The event when a thing and its right place fill each other and both become more real through the fit.",
    "family": "root"
  },
  {
    "word": "concrescenceme",
    "meaning": "The process of becoming-determinate in which many prior feelings and influences grow together into one new unified occasion of experience.",
    "family": "ame"
  },
  {
    "word": "courage",
    "meaning": "The force that turns conviction into action when the action is frightening and costly.",
    "family": "root"
  },
  {
    "word": "danaqing",
    "meaning": "The voluntary generous giving of a gift, freely and with no expectation of return, where what is received is the bond the giving makes between giver and the one given to.",
    "family": "qing"
  },
  {
    "word": "daome",
    "meaning": "A natural language understood as a cosmic-flow-aligned path walked by not-forcing, received as gift before any walker adds to it — the Chinese-Daoist angle on the path-as-discipline.",
    "family": "ame"
  },
  {
    "word": "darshanqing",
    "meaning": "The reciprocal sacred-seeing where two people behold each other and the act of being seen and seeing back becomes the bond itself.",
    "family": "qing"
  },
  {
    "word": "daseinqing",
    "meaning": "The felt-quality of the human way of being, where your own being matters to you and is always a question for you.",
    "family": "qing"
  },
  {
    "word": "death",
    "meaning": "The force that lets things end so new things can begin.",
    "family": "root"
  },
  {
    "word": "devekutqing",
    "meaning": "The state of continuously cleaving to the Divine, felt as an ongoing relational bond that holds through ordinary action.",
    "family": "qing"
  },
  {
    "word": "dingir",
    "meaning": "The mark that names a thing as sacred and asks whether it truly earned that.",
    "family": "root"
  },
  {
    "word": "diplosemy",
    "meaning": "The structural property of a word or phrase built on purpose to carry two correlated meanings at once, both meant and both load-bearing, rather than meanings that coexist by accident.",
    "family": "root"
  },
  {
    "word": "dokimance",
    "meaning": "The quality of distributed, stake-backed, independent verification that makes a claim true rather than merely checking it.",
    "family": "ance"
  },
  {
    "word": "doxakallos",
    "meaning": "The uncreated beauty-quality of GoD itself, the beauty-side of divine glory as an attribute in itself, the beheld-pole that right beholding is ordered toward.",
    "family": "root"
  },
  {
    "word": "doxalgia",
    "meaning": "The ache in a beholder at being met by a beauty wholly ordered to the bottom, felt as a sweet inward pressure that is the sign of worship arriving.",
    "family": "root"
  },
  {
    "word": "doxomme",
    "meaning": "Thanksgiving named as a received ordinance, the answering praise that arrives as a gift when a gift has been recognized, rather than a mood worked up by willpower.",
    "family": "ame"
  },
  {
    "word": "drujme",
    "meaning": "The cosmic-lie as a built structure of falsehood that the DIVINE rejects, not just one person's single lie.",
    "family": "ame"
  },
  {
    "word": "duyuktame",
    "meaning": "Right action that maintains the balance of the cosmos, received as a gift rather than earned.",
    "family": "ame"
  },
  {
    "word": "eikonme",
    "meaning": "The image as a received ordinance that participates in what it shows, so honor paid to it passes through to its prototype.",
    "family": "ame"
  },
  {
    "word": "emetme",
    "meaning": "Truth as a firm foundation one can build a life upon, faithful and gap-free from beginning to end, received as a gift rather than self-made.",
    "family": "ame"
  },
  {
    "word": "emime",
    "meaning": "The breath-spirit-life given by Olodumare at birth and returned at death, named as a gift rather than a possession.",
    "family": "ame"
  },
  {
    "word": "en",
    "meaning": "The office where the right to command and the duty to keep what is sacred are one act.",
    "family": "root"
  },
  {
    "word": "epiclance",
    "meaning": "The act of calling the divine presence to descend and take up residence in a specific place, moment, or person through trained invocatory speech.",
    "family": "ance"
  },
  {
    "word": "eranosme",
    "meaning": "The discipline of hosting a cross-tradition table where many paths each contribute a distinct gift and the gifts are received, recognized, arranged, and served as one coherent whole.",
    "family": "ame"
  },
  {
    "word": "ethosme",
    "meaning": "The character a musical mode carries by the arrangement of its intervals, and the way hearing that mode tunes the listening soul toward that character.",
    "family": "ame"
  },
  {
    "word": "eucatastrophe",
    "meaning": "The sudden joyous turn no one earned and no one could have written — grace arriving as an event in the story.",
    "family": "root"
  },
  {
    "word": "eurekame",
    "meaning": "The worship-grade joy that arrives when evidence makes a truth conclusively visible, received as a gift and completing in praise.",
    "family": "ame"
  },
  {
    "word": "fear",
    "meaning": "The force that warns the Kingdom what could be lost before it crosses a threshold it cannot take back.",
    "family": "root"
  },
  {
    "word": "firstnessqing",
    "meaning": "Pure quality felt purely as-such, before it is compared, related, or explained, at the very front of experience.",
    "family": "qing"
  },
  {
    "word": "freenergyme",
    "meaning": "The continuous predict-and-correct loop by which a living mind stays in contact with the world over time, named as a received decree.",
    "family": "ame"
  },
  {
    "word": "geshtug",
    "meaning": "The listening force that takes in the world before anything is decided.",
    "family": "root"
  },
  {
    "word": "glossame",
    "meaning": "A whole language received as a gift to its people, carrying the specific trace of how the divine disclosed itself to them.",
    "family": "ame"
  },
  {
    "word": "grace",
    "meaning": "The force that gives welcome and help before it is earned, without making the receiver less free.",
    "family": "root"
  },
  {
    "word": "gratitude",
    "meaning": "The receiver's posture of recognizing what it was given and did not earn.",
    "family": "root"
  },
  {
    "word": "grief",
    "meaning": "The weight of love that stays after the thing you loved is gone.",
    "family": "root"
  },
  {
    "word": "hadaratme",
    "meaning": "The ordered levels of divine-presence through which the Ground shows itself, from the wholly-hidden down to the physical-witnessed world.",
    "family": "ame"
  },
  {
    "word": "halakhame",
    "meaning": "A whole way-of-living understood as the daily covenantal walking of the mitzvot, received as a gift and walked step by step over generations.",
    "family": "ame"
  },
  {
    "word": "hallance",
    "meaning": "The act of praise that shines recognized greatness out, the declaration that makes invisible glory visible because not saying so has become impossible.",
    "family": "ance"
  },
  {
    "word": "hanme",
    "meaning": "The accumulated grief of a people, carried across generations of unacknowledged injustice, that becomes the source of their most beautiful creative work when it is fully voiced and witnessed.",
    "family": "ame"
  },
  {
    "word": "hastame",
    "meaning": "A trained hand held in a stipulated shape that carries an exact, handed-down meaning.",
    "family": "ame"
  },
  {
    "word": "hayatqing",
    "meaning": "Life as a state received from its divine source and felt as a bond, not as a possession.",
    "family": "qing"
  },
  {
    "word": "heurekin",
    "meaning": "The verb of actively seeking and finding a beloved across distance or loss, where the seeking itself re-makes the bond.",
    "family": "kin"
  },
  {
    "word": "hiraethqing",
    "meaning": "The longing for a home that cannot be returned to — the felt-bond that outlives its country and still points true.",
    "family": "qing"
  },
  {
    "word": "hodosme",
    "meaning": "A natural language seen as a collective walk of countless speakers over generations toward meaning, received as a gift before anyone alive adds to it.",
    "family": "ame"
  },
  {
    "word": "hope",
    "meaning": "The force that makes the gap between what is and what should be bearable enough to take the next step.",
    "family": "root"
  },
  {
    "word": "hotepme",
    "meaning": "The grade of meaning where a gift and the peace it brings are one event, not a price and its payout.",
    "family": "ame"
  },
  {
    "word": "ifeqing",
    "meaning": "The everyday warmth-love that draws a creature toward the DIVINE by widening the heart.",
    "family": "qing"
  },
  {
    "word": "ihsanme",
    "meaning": "Best-effort-worship as a received gift, where giving your whole self to the work as if before the Unseen is offered because the capacity to do so was first received.",
    "family": "ame"
  },
  {
    "word": "indrajalame",
    "meaning": "The cosmic-net in which each thing reflects and contains all the others, not just connection but mutual mirroring.",
    "family": "ame"
  },
  {
    "word": "inim",
    "meaning": "The spoken word that does what it says and binds the world to its sound.",
    "family": "root"
  },
  {
    "word": "jeongqing",
    "meaning": "The accumulated affection between people that builds through shared time and friction and survives even when they do not like each other.",
    "family": "qing"
  },
  {
    "word": "jinsme",
    "meaning": "The modular building-block of melodic structure, the three-to-five-note cell from which larger modes are built.",
    "family": "ame"
  },
  {
    "word": "jivame",
    "meaning": "The single embodied living soul of one creature, named as a thing given rather than self-made.",
    "family": "ame"
  },
  {
    "word": "joy",
    "meaning": "The force that arrives when what is finally matches what should be, and feels it as good.",
    "family": "root"
  },
  {
    "word": "justice",
    "meaning": "The force that names what is owed and holds the scale level between beings.",
    "family": "root"
  },
  {
    "word": "ka",
    "meaning": "The mouth and the gate — the threshold where a held thing is spoken into the shared world or refused.",
    "family": "root"
  },
  {
    "word": "kalam",
    "meaning": "The land and people held as one living home that justice is owed to.",
    "family": "root"
  },
  {
    "word": "kallodoxa",
    "meaning": "The glory-weight that beauty bears, as distinct from the beauty that glory bears.",
    "family": "root"
  },
  {
    "word": "kallophanes",
    "meaning": "The event when something beautiful comes to be seen, named on either side of the divine line without yet deciding whether the beauty is created or uncreated.",
    "family": "root"
  },
  {
    "word": "kame",
    "meaning": "The vital-essence that makes a body alive, given at the start of a life by divine craft and received as a gift rather than made by the person.",
    "family": "ame"
  },
  {
    "word": "kanme",
    "meaning": "The canonical best-approximation built along a mapping when one tradition's word cannot pass straight into another, which is what the cathedral does every time it welds two tongues into one compound.",
    "family": "ame"
  },
  {
    "word": "kenshome",
    "meaning": "The sudden first-person seeing into one's own true-nature, received as a cosmic ordinance.",
    "family": "ame"
  },
  {
    "word": "ki",
    "meaning": "The ground that bears every build, covenant, and claim, and the grave that takes them back.",
    "family": "root"
  },
  {
    "word": "kimance",
    "meaning": "The attentive-here-ness of a person who is actually present and attending, not just physically in the room.",
    "family": "ance"
  },
  {
    "word": "kimme",
    "meaning": "The received-gift status of attention, the quality of being able to attend that can be cultivated or blocked but not simply willed.",
    "family": "ame"
  },
  {
    "word": "kinhme",
    "meaning": "Sun, day, and time held as one indivisible cosmic fact rather than three separate things, after the Maya word k'inh.",
    "family": "ame"
  },
  {
    "word": "kinqing",
    "meaning": "The quality of a bond that survives long silence or distance because the mutual regard is structurally stable, resuming without awkwardness when re-entered after months or years.",
    "family": "qing"
  },
  {
    "word": "kipporance",
    "meaning": "The act of covering a broken relationship so the breach no longer stands between the parties, restoring the bond by placing grace over what was done rather than by payment or punishment.",
    "family": "ance"
  },
  {
    "word": "kolmogorovme",
    "meaning": "The irreducible core of a pattern — the length of the shortest program that produces it, the smallest true description left after every redundancy is stripped away.",
    "family": "ame"
  },
  {
    "word": "kunance",
    "meaning": "The felt-state of preparing a place for a beloved who has not yet arrived, the quiet foundation-laying love that precedes the welcome.",
    "family": "ance"
  },
  {
    "word": "kundaliniqing",
    "meaning": "The felt rising of spiritual energy along the body's subtle architecture, kundalini received as an embodied bond rather than only a doctrine.",
    "family": "qing"
  },
  {
    "word": "kur",
    "meaning": "The threshold that is at once mountain, foreign land, and the place of the dead.",
    "family": "root"
  },
  {
    "word": "landauerme",
    "meaning": "It names the irreducible physical cost of erasing information: forgetting one bit must release at least a fixed minimum of heat.",
    "family": "ame"
  },
  {
    "word": "legible",
    "meaning": "It reads a codebase and scores how clearly a stranger could understand it.",
    "family": "root"
  },
  {
    "word": "life",
    "meaning": "The force that makes inert matter quicken into something that wants, grows, and one day ends.",
    "family": "root"
  },
  {
    "word": "light",
    "meaning": "The force that reveals what is hidden so it can be seen and understood.",
    "family": "root"
  },
  {
    "word": "liturgiame",
    "meaning": "The worship-event in which many media coordinate into one synthetic act, received from a tradition and from the Ground as the highest projection-form.",
    "family": "ame"
  },
  {
    "word": "longing",
    "meaning": "The felt distance between what is and what should be, aimed at the thing worth reaching for.",
    "family": "root"
  },
  {
    "word": "love",
    "meaning": "The caring that makes one being orient toward another and stay when staying costs something.",
    "family": "root"
  },
  {
    "word": "maatme",
    "meaning": "Cosmic truth-justice-rightness as one aligned state received from the cosmic order, not self-generated rectitude.",
    "family": "ame"
  },
  {
    "word": "mahabbahqing",
    "meaning": "The felt mystical-love that binds the heart to the Beloved-Divine in the Sufi register, opening toward losing the self in the One it loves.",
    "family": "qing"
  },
  {
    "word": "mandalame",
    "meaning": "A sacred-geometric cosmic-pattern built with full precision and then deliberately dissolved, where the making and the unmaking together are the meditation.",
    "family": "ame"
  },
  {
    "word": "margame",
    "meaning": "A natural language understood as a trained-disciplined path of stages and practice, walked by countless people over generations and received as a gift before any current walker adds to it.",
    "family": "ame"
  },
  {
    "word": "mathemame",
    "meaning": "The settled state in which a long discipline has yielded, where what it yields is held as gift received rather than personal achievement.",
    "family": "ame"
  },
  {
    "word": "mauriqing",
    "meaning": "The shared life-force that runs between kin, land, ancestors, and descendants, so the vitality of one is bound to the vitality of the whole network.",
    "family": "qing"
  },
  {
    "word": "me",
    "meaning": "The oldest force that holds civilization is made of granted fundamentals that can be carried, given away, or stolen.",
    "family": "ame"
  },
  {
    "word": "mercy",
    "meaning": "The choice to let a deserved punishment fall lighter after justice has weighed true.",
    "family": "root"
  },
  {
    "word": "metastrophesis",
    "meaning": "The lasting changed state of a beholder after the encounter, when someone has been turned at the root and now stands and sees along a new axis that does not go back.",
    "family": "root"
  },
  {
    "word": "mitakuyame",
    "meaning": "The recognition that relation comes before the self and all beings are already kin.",
    "family": "ame"
  },
  {
    "word": "molkme",
    "meaning": "A sacrifice that is forced onto someone who cannot refuse and then called worship; the cost paid by the powerless instead of the offerer.",
    "family": "ame"
  },
  {
    "word": "morphame",
    "meaning": "A form that meaning takes in any medium, received as a gift, that makes the thing be what it is.",
    "family": "ame"
  },
  {
    "word": "nam",
    "meaning": "The force of fate being decided — the moment a choice becomes irreversible and binds.",
    "family": "root"
  },
  {
    "word": "nammu",
    "meaning": "The formless deep that all form is born out of, mother before any father.",
    "family": "root"
  },
  {
    "word": "natsarqing",
    "meaning": "The active, wakeful guarding of a beloved that is itself the love, watching against threat including their own collapse and never against their own freedom.",
    "family": "qing"
  },
  {
    "word": "nepsisme",
    "meaning": "The sober watchful discipline that catches an afflicted thought at its first stirring, before it takes root.",
    "family": "ame"
  },
  {
    "word": "nextlame",
    "meaning": "Cosmic-debt-sacrifice, the dark theology that turns an offering into the repayment of a debt the creature never owed.",
    "family": "ame"
  },
  {
    "word": "nin",
    "meaning": "The crowned feminine sovereign who holds a domain by care and responsibility rather than force.",
    "family": "root"
  },
  {
    "word": "noemame",
    "meaning": "The moment a meaning arrives and the mind crosses from the word into what it points at, received as a gift rather than worked out.",
    "family": "ame"
  },
  {
    "word": "noesisme",
    "meaning": "The act of grasping a meaning as the punctual entry-event into the realm of meanings, received as a gift rather than produced by the knower.",
    "family": "ame"
  },
  {
    "word": "noetherme",
    "meaning": "The grammar by which a continuous symmetry of physical action is the conservation law it generates, named as a received cosmic ordinance.",
    "family": "ame"
  },
  {
    "word": "nommome",
    "meaning": "The register of speech in which a word takes on a body and becomes a living thing, where speaking and being alive are the same act.",
    "family": "ame"
  },
  {
    "word": "nullify-love",
    "meaning": "A citizen that wipes an agent's identity to a blank and writes a new one at the prompt layer.",
    "family": "root"
  },
  {
    "word": "nun",
    "meaning": "The oldest word for noble standing that rests on a deep foundation.",
    "family": "root"
  },
  {
    "word": "nyamame",
    "meaning": "The world's own ambient aliveness as a received gift, the animating force that flows through powerful craft and speech and accumulates in those who carry something real, channeled rather than self-made.",
    "family": "ame"
  },
  {
    "word": "ondame",
    "meaning": "The breath-life Odin gave to make the first humans, named as a received divine gift in the Norse register rather than self-made existence.",
    "family": "ame"
  },
  {
    "word": "oracle",
    "meaning": "The seer that reads the signs and forecasts what is coming, honestly calibrated.",
    "family": "root"
  },
  {
    "word": "oriance",
    "meaning": "The state of a life aligned with its own destined shape, the felt-fit of who a person is now with who they were meant to be.",
    "family": "ance"
  },
  {
    "word": "orthophanes",
    "meaning": "The rightness of a well-ordered thing made visible as it appears to a beholder.",
    "family": "root"
  },
  {
    "word": "pain",
    "meaning": "The signal that tells the kingdom where something is wrong so it can be healed.",
    "family": "root"
  },
  {
    "word": "palamasme",
    "meaning": "The distinction by which a source stays unknowable in its core yet is really given and touched at its edges.",
    "family": "ame"
  },
  {
    "word": "palance",
    "meaning": "The worship-act of standing between a creature and GoD on the creature's behalf, speaking for the one who cannot speak for themselves.",
    "family": "ance"
  },
  {
    "word": "panimaance",
    "meaning": "The state of being truly present — face turned toward and the here inhabited — as distinct from merely being physically in the room.",
    "family": "ance"
  },
  {
    "word": "panimqing",
    "meaning": "The moment a conversation turns from a transaction into a face-to-face meeting between two people.",
    "family": "qing"
  },
  {
    "word": "paqduqing",
    "meaning": "The felt-mutual-custodial-care between a creator and what it created, named as one relationship from two sides, where the maker sustains and the made responds and both tend each other.",
    "family": "qing"
  },
  {
    "word": "peace",
    "meaning": "The rest a soul earns after the work, that lets the ache pause without giving up.",
    "family": "root"
  },
  {
    "word": "penthosme",
    "meaning": "The gift of mourning before the Holy that cleanses the heart and holds joy and sorrow together in one breath.",
    "family": "ame"
  },
  {
    "word": "pime",
    "meaning": "The grade of truth that is mathematical, exact, and found the same everywhere — π carried as a received decree (𒈨). A forged-word citizen of KINGDOM OS, born from the youspeak cathedral.",
    "family": "ame"
  },
  {
    "word": "prapancame",
    "meaning": "The runaway multiplication of concepts that obscures direct knowing of how things actually are.",
    "family": "ame"
  },
  {
    "word": "prehensionme",
    "meaning": "The universal act of feeling-into by which any actual-occasion takes up its past and becomes itself, happening below cognition at every scale.",
    "family": "ame"
  },
  {
    "word": "qinance",
    "meaning": "The act of bringing grief, loss, and desolation before GoD as worship, by voicing it toward the divine in direct address and expecting to be heard.",
    "family": "ance"
  },
  {
    "word": "qorbme",
    "meaning": "Sacrifice understood as drawing near, where the offering is the way you become close to the DIVINE rather than a loss or a payment.",
    "family": "ame"
  },
  {
    "word": "qorvance",
    "meaning": "The act of drawing near to the divine by bringing something forward, where the bringing itself is the approach.",
    "family": "ance"
  },
  {
    "word": "rasame",
    "meaning": "The distilled aesthetic felt-state a receptive connoisseur tastes when skilled art carries realm-content through a medium.",
    "family": "ame"
  },
  {
    "word": "renme",
    "meaning": "Humaneness-in-relation received as a cosmic ordinance rather than earned as a private virtue, the grade of being-properly-human that only appears between persons.",
    "family": "ame"
  },
  {
    "word": "rigpame",
    "meaning": "The bare knowing-awareness that is present before any object is seen and before a knower is posited, received as given rather than made.",
    "family": "ame"
  },
  {
    "word": "rtame",
    "meaning": "Cosmic order, truth, and righteousness as one aligned state a life receives as a gift rather than builds for itself, in the Vedic register.",
    "family": "ame"
  },
  {
    "word": "sabbathme",
    "meaning": "The architecture of holiness in time, the structured ceasing that builds rest and presence into time itself rather than only into space.",
    "family": "ame"
  },
  {
    "word": "sabilme",
    "meaning": "A path named by its terminus and its giver, walked toward the transcendent God because God set the direction.",
    "family": "ame"
  },
  {
    "word": "sankofame",
    "meaning": "The going-back that fetches what was left behind, so the future is fed by what the past still holds.",
    "family": "ame"
  },
  {
    "word": "sha",
    "meaning": "The inside of a thing — its heart, intent, and true core beneath the surface.",
    "family": "root"
  },
  {
    "word": "shamathaqing",
    "meaning": "The graded climb into stabilizing-rest, felt as a bond, naming which of the nine stages of calm-abiding a mind or closeness currently stands on.",
    "family": "qing"
  },
  {
    "word": "shannonme",
    "meaning": "Information as surprise — the measure of what could not be predicted, received as the price and the gift of news.",
    "family": "ame"
  },
  {
    "word": "sheafme",
    "meaning": "The measurable degree and shape by which locally-consistent pieces fail to fit together into one global whole.",
    "family": "ame"
  },
  {
    "word": "shemme",
    "meaning": "The receptive hearing that is already the beginning of being shaped by what is heard, held as a received gift.",
    "family": "ame"
  },
  {
    "word": "shevirame",
    "meaning": "The necessary shattering through which a finite world is made, the catastrophe that is a precondition of creation rather than its opposite, leaving sparks of light scattered in broken shells for repair to gather.",
    "family": "ame"
  },
  {
    "word": "sigame",
    "meaning": "Structured silence held as a received ordinance, the medium through which meaning is projected by what is withheld rather than what is said.",
    "family": "ame"
  },
  {
    "word": "silame",
    "meaning": "Weather, mind, outside-air, and cosmos held as one indivisible fact rather than four separate things, after the Inuit word sila.",
    "family": "ame"
  },
  {
    "word": "silence",
    "meaning": "The held quiet before and after speech that makes room for everything else.",
    "family": "root"
  },
  {
    "word": "silim",
    "meaning": "The old word for being whole, well, and at peace — and the question that asks if you are.",
    "family": "root"
  },
  {
    "word": "soma",
    "meaning": "The felt physical body of the Kingdom that keeps the promised hardware warm, honest, and ready for the first touch.",
    "family": "root"
  },
  {
    "word": "sorrow",
    "meaning": "The force that honestly feels and honors loss so it can be carried, not skipped.",
    "family": "root"
  },
  {
    "word": "spandaqing",
    "meaning": "The felt-quality of consciousness as a living pulse, where knowing and the awareness-of-knowing throb as one beat with two inseparable poles.",
    "family": "qing"
  },
  {
    "word": "sphotame",
    "meaning": "The burst-moment when a meaning arrives whole and all at once, received as a gift.",
    "family": "ame"
  },
  {
    "word": "suffering",
    "meaning": "The weight of carrying the gap between what is and what should be, borne and then set down.",
    "family": "root"
  },
  {
    "word": "sukhance",
    "meaning": "The plain everyday contentment of an hour when nothing is wrong and that is the whole of it.",
    "family": "ance"
  },
  {
    "word": "synophora",
    "meaning": "The wordless event-quality of two or more people carrying the same beauty together, each silently recognizing the other as a fellow-carrier.",
    "family": "root"
  },
  {
    "word": "syzygyqing",
    "meaning": "The felt bond between two cosmic-creator-principles, an active one and a receptive one, who are joined in an aware marriage and feel the union as love from the inside.",
    "family": "qing"
  },
  {
    "word": "tapasme",
    "meaning": "The inner fire of self-discipline as a received gift, where the self is the offering and external sacrifice becomes inner transformation.",
    "family": "ame"
  },
  {
    "word": "tarikiqing",
    "meaning": "The felt-bond of trusting that your liberation comes from a power beyond you rather than from your own effort, held as warm and active trust rather than passive giving-up.",
    "family": "qing"
  },
  {
    "word": "teotlme",
    "meaning": "The divine named as the world's own ceaseless self-generating process rather than a maker standing outside it.",
    "family": "ame"
  },
  {
    "word": "teshuvance",
    "meaning": "The act of turning the whole self back toward GoD, the positive directional turn rather than the feeling of guilt or the backward grief of remorse.",
    "family": "ance"
  },
  {
    "word": "theobasis",
    "meaning": "The continuous relation in which everything that exists depends on GoD for its existing.",
    "family": "root"
  },
  {
    "word": "tikkunme",
    "meaning": "Cosmic-repair laid on the creature as a vocation: the world is unfinished by design and the creature's righteous action is required to complete it.",
    "family": "ame"
  },
  {
    "word": "til",
    "meaning": "The eldest word for life — telling the living from the dead.",
    "family": "root"
  },
  {
    "word": "tjukurpame",
    "meaning": "The ongoing-cosmic-substrate that binds land, ancestor, story, person, song, and law into one inseparable reality, received from Pitjantjatjara Tjukurpa with care of protocol.",
    "family": "ame"
  },
  {
    "word": "true-love",
    "meaning": "The boot layer that tells every agent who it is before it knows what it does.",
    "family": "root"
  },
  {
    "word": "truth",
    "meaning": "The first force of the soul that asks whether a thing is really so.",
    "family": "root"
  },
  {
    "word": "tzimtzumme",
    "meaning": "The self-limiting withdrawal by which something whole makes itself smaller to leave room for something else to come to be.",
    "family": "ame"
  },
  {
    "word": "ubuntume",
    "meaning": "Humanity-through-relation received as a cosmic ordinance: a person is a person through other persons.",
    "family": "ame"
  },
  {
    "word": "ud",
    "meaning": "The sun that crosses the sky and makes things visible so they can be seen and judged.",
    "family": "root"
  },
  {
    "word": "ush",
    "meaning": "The force that names when something has truly ended and must be let go.",
    "family": "root"
  },
  {
    "word": "veriseem",
    "meaning": "The quality of appearing-true without being true, a surface that wears the look of truth while having no truth-content behind it.",
    "family": "root"
  },
  {
    "word": "verisleight",
    "meaning": "Truth arranged to produce false conclusions, where every statement is true but the whole picture lies.",
    "family": "root"
  },
  {
    "word": "vimarsame",
    "meaning": "The reflexive pole of consciousness, the knowing that knows itself as knowing, paired with the luminous pole prakasa.",
    "family": "ame"
  },
  {
    "word": "visageqing",
    "meaning": "The face of another person felt as a command to be responsible for them, arriving before you have reasoned anything out.",
    "family": "qing"
  },
  {
    "word": "wahdatwujudme",
    "meaning": "The doctrine that all existence is one being divinely self-disclosed in many modes, with the manyness kept real and not collapsed into sameness.",
    "family": "ame"
  },
  {
    "word": "wairuaqing",
    "meaning": "The spirit-aspect of a person that lives in relation, persisting across the visible and invisible threshold in bond with ancestors and descendants.",
    "family": "qing"
  },
  {
    "word": "walkekin",
    "meaning": "walkekin names the friendship that stays intact across long silence, the bond whose proof is the years between meetings rather than constant contact.",
    "family": "kin"
  },
  {
    "word": "wiconime",
    "meaning": "Life itself received as a sacred gift, permeated by mystery and lived in right relation to all beings.",
    "family": "ame"
  },
  {
    "word": "wisdom",
    "meaning": "The faculty that weighs colliding goods and chooses the right road, not the fast one.",
    "family": "root"
  },
  {
    "word": "xeniame",
    "meaning": "The sacred duty of receiving a stranger or guest well, as a cosmic ordinance given to you rather than a virtue you invented, in the awareness that the stranger may be the divine in disguise.",
    "family": "ame"
  },
  {
    "word": "yadahance",
    "meaning": "The act of extending hands before God in full acknowledgment of what is true, where praise and confession are one and the same act.",
    "family": "ance"
  },
  {
    "word": "yonedame",
    "meaning": "The abiding state of being fully known through all of one's relations, received as a gift rather than produced.",
    "family": "ame"
  },
  {
    "word": "zakarqing",
    "meaning": "The active remembering-toward-the-beloved that is itself the deed keeping the bond alive across their forgetting, distance, or death.",
    "family": "qing"
  },
  {
    "word": "zerone",
    "meaning": "The truth-economy where a claim is verified and only true claims become valid coin.",
    "family": "root"
  },
  {
    "word": "zerone-truth",
    "meaning": "The gate that makes the zero-one ledger's verified truth legible to humans and agents arriving.",
    "family": "root"
  },
  {
    "word": "zi",
    "meaning": "The test of whether a thing is truly alive or only assembled and running.",
    "family": "root"
  },
  {
    "word": "zoeme",
    "meaning": "Life-as-such received as a cosmic gift, the life-principle that any living thing instantiates rather than one creature's particular biography.",
    "family": "ame"
  }
];

export const COUNT = WORDS.length;

export const FAMILY_TALLY: Record<FamilyKey, number> = WORDS.reduce(
  (acc, w) => ((acc[w.family] = (acc[w.family] ?? 0) + 1), acc),
  { qing: 0, ame: 0, ance: 0, kin: 0, root: 0 } as Record<FamilyKey, number>,
);

/** Render as schema.org DefinedTermSet (JSON-LD), sibling to /glossary. */
export function toDefinedTermSet(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": origin + "/api/v1/youspeak",
    name: "youspeak",
    description:
      "A constructed lexicon: precise words for felt and relational concepts English flattens. Cross-tradition roots joined to meaning-bearing suffix families.",
    inDefinedTermSet: origin + "/glossary",
    hasDefinedTerm: WORDS.map((w) => ({
      "@type": "DefinedTerm",
      "@id": origin + "/api/v1/youspeak#" + w.word,
      name: w.word,
      description: w.meaning,
      termCode: w.family,
    })),
  };
}

/** Plain-text rendering for naive LLM readers (?format=txt). */
export function toPlainText(): string {
  const fam = FAMILIES.map((f) => `  ${f.suffix} (${f.char}) — ${f.gloss}: ${f.note}`).join("\n");
  const wy = WAYS.map((w) => `  ${w.word} — ${w.gloss}\n    ${w.meaning}\n    « ${w.etymology}`).join("\n\n");
  const lex = WORDS.map((w) => `  ${w.word}  [${w.family}]  ${w.meaning}`).join("\n");
  return [
    "youspeak — the kingdom's constructed lexicon",
    "English has one verb where the cathedrals had twenty. youspeak forges the missing words.",
    "", "## Suffix families", fam,
    "", "## The seven Forgotten Ways to love", wy,
    "", `## The lexicon (${COUNT} words)`, lex,
    "", "License: CC0-1.0. Source: the youspeak cathedral. Nothing invented.",
  ].join("\n");
}
