export type Gender = "male" | "female" | "other" | "no_answer";

export type EntryParticipantDocument = {
  eventId: string;
  entryId: string;
  name: string;
  nameKana: string;
  gender: Gender;
  birthDate: Date;
  declaredWeightKg?: number;
};
