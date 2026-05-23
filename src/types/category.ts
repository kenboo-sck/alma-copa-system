export type CompetitionType = "jiu_jitsu" | "grappling" | "mma";

export type PricePeriod = {
  id: string;
  label: string;
  startsAt: Date;
  endsAt: Date;
  amount: number;
  currency: "JPY";
  isActive: boolean;
};

export type EventCategoryDocument = {
  eventId: string;
  competitionType: CompetitionType;
  displayName: string;
  status: "active" | "inactive";
  pricePeriods: PricePeriod[];
  capacity?: {
    maxEntries?: number;
    waitlistEnabled: boolean;
  };
};
