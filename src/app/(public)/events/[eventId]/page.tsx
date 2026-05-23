import { PublicEventDetail } from "@/features/events";

type EventDetailPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { eventId } = await params;

  return <PublicEventDetail eventId={eventId} />;
}
