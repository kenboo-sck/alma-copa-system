"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";

import type { AdminEvent, EventFormValues } from "./admin-event-types";
import {
  defaultEventFormValues,
  eventFormSchema,
  getEventFormValues,
} from "./admin-event-utils";

type AdminEventFormModalProps = {
  event: AdminEvent | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: EventFormValues, imageFile: File | null) => Promise<void>;
};

const defaultEventImage = "/images/event-card-bg.jpg";

export function AdminEventFormModal({
  event,
  isSaving,
  onClose,
  onSubmit,
}: AdminEventFormModalProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(event?.imageUrl || "");
  const objectPreviewUrlRef = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: defaultEventFormValues,
  });

  useEffect(() => {
    reset(event ? getEventFormValues(event) : defaultEventFormValues);
  }, [event, reset]);

  useEffect(() => {
    return () => {
      if (objectPreviewUrlRef.current) {
        URL.revokeObjectURL(objectPreviewUrlRef.current);
      }
    };
  }, []);

  function handleImageChange(changeEvent: ChangeEvent<HTMLInputElement>) {
    const nextFile = changeEvent.target.files?.[0] ?? null;
    if (objectPreviewUrlRef.current) {
      URL.revokeObjectURL(objectPreviewUrlRef.current);
      objectPreviewUrlRef.current = null;
    }

    setImageFile(nextFile);

    if (nextFile) {
      const objectUrl = URL.createObjectURL(nextFile);
      objectPreviewUrlRef.current = objectUrl;
      setImagePreviewUrl(objectUrl);
    } else {
      setImagePreviewUrl(event?.imageUrl || "");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-lg border border-alma-gold/40 bg-zinc-950 shadow-2xl shadow-black sm:max-w-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-zinc-950/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-semibold text-alma-gold">
              大会情報
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">
              {event ? "大会を編集" : "大会を追加"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-alma-gold hover:text-alma-gold"
          >
            閉じる
          </button>
        </div>

        <form
          onSubmit={(formEvent) =>
            void handleSubmit((values) => onSubmit(values, imageFile))(formEvent)
          }
          className="p-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-zinc-200">大会名</span>
              <input
                {...register("title")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.title ? (
                <span className="text-xs text-red-300">{errors.title.message}</span>
              ) : null}
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-zinc-200">説明</span>
              <textarea
                {...register("description")}
                rows={5}
                className="w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.description ? (
                <span className="text-xs text-red-300">
                  {errors.description.message}
                </span>
              ) : null}
            </label>

            <div className="space-y-3 md:col-span-2">
              <div>
                <span className="text-sm font-semibold text-zinc-200">
                  大会メイン画像
                </span>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  トップページ、大会一覧、大会詳細に表示されます。
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-start">
                <div
                  className="min-h-36 overflow-hidden rounded-md border border-white/10 bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.42)),url('${imagePreviewUrl || defaultEventImage}')`,
                  }}
                />
                <label className="flex min-h-36 cursor-pointer flex-col justify-center rounded-md border border-dashed border-alma-gold/35 bg-black px-4 py-4 transition hover:border-alma-gold">
                  <span className="text-sm font-semibold text-alma-gold">
                    画像を選択
                  </span>
                  <span className="mt-2 text-xs leading-5 text-zinc-400">
                    JPG、PNG、WebPなどの画像ファイルを選択してください。保存時にFirebase Storageへアップロードします。
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="mt-4 block w-full text-xs text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-alma-gold file:px-3 file:py-2 file:text-xs file:font-semibold file:text-black"
                  />
                  <span className="mt-3 truncate text-xs text-zinc-500">
                    {imageFile?.name || (event?.imageUrl ? "現在の画像を使用" : "未選択")}
                  </span>
                </label>
              </div>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">開催日</span>
              <input
                type="date"
                {...register("eventDate")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.eventDate ? (
                <span className="text-xs text-red-300">
                  {errors.eventDate.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">会場</span>
              <input
                {...register("venue")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.venue ? (
                <span className="text-xs text-red-300">{errors.venue.message}</span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">
                エントリー開始日
              </span>
              <input
                type="datetime-local"
                {...register("entryStartAt")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.entryStartAt ? (
                <span className="text-xs text-red-300">
                  {errors.entryStartAt.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">
                エントリー終了日
              </span>
              <input
                type="datetime-local"
                {...register("entryEndAt")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.entryEndAt ? (
                <span className="text-xs text-red-300">
                  {errors.entryEndAt.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-zinc-200">ステータス</span>
              <select
                {...register("status")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              >
                <option value="draft">draft（下書き）</option>
                <option value="published">published（公開中）</option>
                <option value="closed">closed（受付終了）</option>
              </select>
            </label>

            <div className="md:col-span-2 mt-2 border-t border-white/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-alma-gold">
                Price Settings
              </p>
              <h3 className="mt-2 text-lg font-bold text-white">エントリー価格</h3>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">
                早期割引価格
              </span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                {...register("earlyBirdPrice")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.earlyBirdPrice ? (
                <span className="text-xs text-red-300">
                  {errors.earlyBirdPrice.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">
                早期割引開始
              </span>
              <input
                type="datetime-local"
                {...register("earlyBirdStartAt")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.earlyBirdStartAt ? (
                <span className="text-xs text-red-300">
                  {errors.earlyBirdStartAt.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">
                早期割引終了
              </span>
              <input
                type="datetime-local"
                {...register("earlyBirdEndAt")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.earlyBirdEndAt ? (
                <span className="text-xs text-red-300">
                  {errors.earlyBirdEndAt.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">通常価格</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                {...register("regularPrice")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.regularPrice ? (
                <span className="text-xs text-red-300">
                  {errors.regularPrice.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">通常価格開始</span>
              <input
                type="datetime-local"
                {...register("regularStartAt")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.regularStartAt ? (
                <span className="text-xs text-red-300">
                  {errors.regularStartAt.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">通常価格終了</span>
              <input
                type="datetime-local"
                {...register("regularEndAt")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.regularEndAt ? (
                <span className="text-xs text-red-300">
                  {errors.regularEndAt.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">最終価格</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                {...register("latePrice")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.latePrice ? (
                <span className="text-xs text-red-300">
                  {errors.latePrice.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">最終価格開始</span>
              <input
                type="datetime-local"
                {...register("lateStartAt")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.lateStartAt ? (
                <span className="text-xs text-red-300">
                  {errors.lateStartAt.message}
                </span>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-200">最終価格終了</span>
              <input
                type="datetime-local"
                {...register("lateEndAt")}
                className="h-11 w-full rounded-md border border-white/10 bg-black px-3 text-sm text-white outline-none transition focus:border-alma-gold"
              />
              {errors.lateEndAt ? (
                <span className="text-xs text-red-300">
                  {errors.lateEndAt.message}
                </span>
              ) : null}
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "保存中..." : "保存する"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
