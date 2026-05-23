import { EntryCheckoutForm } from "@/features/entries";

type IndividualEntryPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function IndividualEntryPage({
  params,
}: IndividualEntryPageProps) {
  const { eventId } = await params;

  return <EntryCheckoutForm eventId={eventId} entryType="individual" />;
}
