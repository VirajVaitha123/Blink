/**
 * Hand-curated bigram seeds: previous word → likely next words, ordered by
 * priority (earlier = more likely). Two roles:
 *
 *   1. Sentence-mid completions: when the user types a partial word with a
 *      known previous word, candidates appearing in this list get a strong
 *      score boost so e.g. "i ha" prefers "have" over "had/has/had".
 *
 *   2. Post-space prediction: when the user finishes a word with a space,
 *      we look up the previous word here to seed the next-word strip.
 *
 * Skewed toward AAC-relevant phrasing (states, asks, family). Personal use
 * is tracked separately and stacks on top of these via the dynamic bigram
 * map in the predictor.
 */
export const BIGRAMS: Readonly<Record<string, readonly string[]>> = {
  i: ["am", "have", "want", "need", "will", "can", "feel", "think", "love", "hope", "had", "do", "would", "was"],
  you: ["are", "can", "have", "will", "want", "should", "look", "do", "know", "feel"],
  we: ["are", "can", "will", "have", "should", "need", "want"],
  they: ["are", "have", "will", "can", "do", "had", "were", "should"],
  he: ["is", "was", "has", "will", "had", "can", "would", "could"],
  she: ["is", "was", "has", "will", "had", "can", "would", "could"],
  it: ["is", "was", "will", "has", "had", "can", "would", "could", "hurts"],
  the: ["best", "same", "first", "last", "next", "other", "only", "way", "most", "right"],
  a: ["good", "bit", "lot", "little", "few", "new", "small", "big", "moment"],
  am: ["going", "not", "feeling", "trying", "tired", "hungry", "thirsty", "fine", "ok", "happy", "sad", "scared", "in", "cold", "hot"],
  is: ["a", "the", "not", "very", "still", "good", "bad", "ok", "fine", "broken", "wrong", "right"],
  are: ["you", "we", "they", "going", "not", "very", "fine", "ok"],
  was: ["a", "the", "not", "very", "going", "trying", "in"],
  have: ["a", "to", "been", "the", "not", "you", "we", "any", "some", "more"],
  has: ["a", "the", "been", "not", "to", "more", "any"],
  had: ["a", "the", "to", "been", "not", "some"],
  will: ["be", "you", "we", "they", "not", "have", "go", "come"],
  can: ["you", "i", "we", "they", "not", "be", "have", "see", "help"],
  want: ["to", "you", "some", "more", "it", "a", "the", "water", "food"],
  need: ["to", "you", "some", "more", "a", "the", "water", "help", "food", "bathroom"],
  feel: ["like", "good", "bad", "tired", "sick", "happy", "sad", "fine", "scared", "ok"],
  do: ["you", "not", "we", "they", "i", "it", "the"],
  go: ["to", "back", "home", "now", "out", "with"],
  come: ["here", "back", "to", "with", "in", "on"],
  please: ["help", "come", "give", "tell", "stop", "wait", "be"],
  thanks: ["for", "to", "you", "so"],
  thank: ["you"],
  hello: ["there", "everyone"],
  yes: ["please", "i", "thank", "thanks"],
  no: ["thanks", "thank", "i", "not", "more", "please"],
  not: ["a", "the", "very", "to", "feeling", "going", "good", "bad", "really", "ok"],
  going: ["to", "out", "home", "back", "now"],
  to: ["the", "a", "be", "go", "have", "you", "see", "do", "eat", "drink", "sleep"],
  in: ["the", "a", "my", "this", "that"],
  on: ["the", "a", "my", "this", "that", "top"],
  of: ["the", "a", "my", "this", "that"],
  at: ["the", "a", "home", "night", "work", "school"],
  with: ["the", "a", "you", "me", "my", "him", "her", "them"],
  my: ["mom", "dad", "wife", "husband", "family", "name", "head", "back", "hand", "leg", "foot", "eye", "stomach", "chest"],
  your: ["mom", "dad", "wife", "husband", "family", "name", "help"],
  this: ["is", "was", "one", "morning", "afternoon", "evening", "week"],
  that: ["is", "was", "one", "the", "way"],
  what: ["is", "are", "do", "you", "i", "we", "the", "time"],
  where: ["is", "are", "do", "you", "i", "we"],
  when: ["is", "are", "do", "you", "i", "we", "will"],
  how: ["are", "is", "do", "much", "many", "long"],
  and: ["i", "you", "the", "a", "we", "they"],
  but: ["i", "you", "the", "we", "it"],
  or: ["the", "a", "i", "you"],
  if: ["you", "i", "we", "the", "they"],
  good: ["morning", "night", "day", "luck", "thanks"],
  bad: ["day", "morning", "night"],
};

/**
 * Words to surface when there's no prior word at all (start of transcript)
 * or when bigram and dynamic bigram lookups both miss. Ordered by AAC
 * priority — pronouns and acks first, then common starters.
 */
export const SENTENCE_STARTERS: readonly string[] = [
  "i", "yes", "no", "the", "you", "we", "please", "thanks", "hello", "help",
];
