import { EntryTypeSelection } from "@/features/events/entry-type-selection";

type EntryTypePageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EntryTypePage({ params }: EntryTypePageProps) {
  const { eventId } = await params;

  return <EntryTypeSelection eventId={eventId} />;
}
