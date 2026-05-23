import { EntryCheckoutForm } from "@/features/entries";

type RepresentativeEntryPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function RepresentativeEntryPage({
  params,
}: RepresentativeEntryPageProps) {
  const { eventId } = await params;

  return <EntryCheckoutForm eventId={eventId} entryType="representative" />;
}
