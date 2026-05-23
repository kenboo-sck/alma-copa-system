import { PaymentCancelStatus } from "@/features/payments";

type PaymentCancelPageProps = {
  searchParams: Promise<{
    entry_id?: string;
  }>;
};

export default async function PaymentCancelPage({
  searchParams,
}: PaymentCancelPageProps) {
  const { entry_id: entryId } = await searchParams;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-alma-gold">決済未完了</p>
      <h1 className="mt-2 text-3xl font-bold text-white">支払いがキャンセルされました</h1>
      <PaymentCancelStatus entryId={entryId} />
    </section>
  );
}
