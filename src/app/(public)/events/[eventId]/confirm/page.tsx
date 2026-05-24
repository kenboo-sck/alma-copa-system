import { EntryConfirmationPage } from "@/features/entries/entry-confirmation-page";
import { redirect } from "next/navigation";

type EntryConfirmPageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<{
    entry_id?: string;
    session_id?: string;
    applicant_name?: string;
    applicant_email?: string;
    event_title?: string;
    entry_type?: "individual" | "representative";
  }>;
};

export default async function EntryConfirmPage({
  params,
  searchParams,
}: EntryConfirmPageProps) {
  const { eventId } = await params;
  const {
    entry_id: entryId,
    session_id: sessionId,
    applicant_name: applicantName,
    applicant_email: applicantEmail,
    event_title: eventTitle,
    entry_type: entryType,
  } = await searchParams;

  if (entryId || sessionId) {
    const completionParams = new URLSearchParams();
    completionParams.set("event_id", eventId);

    if (entryId) {
      completionParams.set("entry_id", entryId);
    }
    if (sessionId) {
      completionParams.set("session_id", sessionId);
    }
    if (applicantName) {
      completionParams.set("applicant_name", applicantName);
    }
    if (applicantEmail) {
      completionParams.set("applicant_email", applicantEmail);
    }
    if (eventTitle) {
      completionParams.set("event_title", eventTitle);
    }
    if (entryType) {
      completionParams.set("entry_type", entryType);
    }

    redirect(`/payment/success?${completionParams.toString()}`);
  }

  return <EntryConfirmationPage eventId={eventId} />;
}
