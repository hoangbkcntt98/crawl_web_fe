export type AnkiFields = {
  Word?: string;
  MeaningDestination?: string;
  Example1_Source?: string;
  Example1_Destination?: string;
};

export function getAnkiConfig() {
  const database = process.env.ANKI_AI_DATABASE?.trim() || process.env.DB_NAME || "";
  const table = process.env.ANKI_AI_NOTES_TABLE?.trim() || "anki_ai_notes";
  const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!identifierPattern.test(database) || !identifierPattern.test(table)) {
    throw new Error("Anki database or table name is invalid.");
  }
  const noteType = process.env.ANKI_AI_NOTE_TYPE?.trim() || "AIWordWithImage";
  if (!noteType || noteType.length > 255) throw new Error("ANKI_AI_NOTE_TYPE is invalid.");
  const tags = Array.from(new Set((process.env.ANKI_AI_TAGS || "api").split(",").map((tag) => tag.trim()).filter(Boolean)));
  return { database, noteType, table, tags };
}
