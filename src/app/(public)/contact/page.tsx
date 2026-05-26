import { ContactForm } from "@/features/contact";

export default function ContactPage() {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold text-alma-gold">CONTACT</p>
        <h1 className="mt-2 text-3xl font-bold text-white">お問い合わせ</h1>
        <p className="mt-3 max-w-3xl text-zinc-400">
          大会に関するご質問・ご相談はこちらからお問い合わせください。
        </p>
      </div>
      <ContactForm />
    </section>
  );
}
