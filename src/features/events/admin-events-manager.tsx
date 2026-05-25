"use client";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { db, storage } from "@/lib/firebase/client";
import { collections } from "@/lib/firebase/collections";
import type { EventStatus } from "@/types/event";

import { AdminEventFormModal } from "./admin-event-form-modal";
import type {
  AdminEvent,
  EventFormValues,
  EventSortKey,
  EventStatusFilter,
} from "./admin-event-types";
import { eventStatusLabels } from "./admin-event-types";
import { AdminEventsList } from "./admin-events-list";
import { AdminEventsToolbar } from "./admin-events-toolbar";
import {
  createEventPayload,
  isCountableEntryStatus,
  mapEventData,
} from "./admin-event-utils";

function getComparableTime(value: Date | null, fallback: number) {
  return value?.getTime() ?? fallback;
}

async function uploadEventMainImage(eventId: string, imageFile: File) {
  const imagePath = `events/${eventId}/main-image`;
  const imageRef = storageRef(storage, imagePath);

  await uploadBytes(imageRef, imageFile, {
    contentType: imageFile.type || "application/octet-stream",
    cacheControl: "public,max-age=3600",
  });

  return {
    imagePath,
    imageUrl: await getDownloadURL(imageRef),
  };
}

export function AdminEventsManager() {
  const [rawEvents, setRawEvents] = useState<AdminEvent[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [isEntriesLoading, setIsEntriesLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>("all");
  const [sortKey, setSortKey] = useState<EventSortKey>("eventDateAsc");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collections.events),
      (snapshot) => {
        const nextEvents = snapshot.docs
          .filter((eventSnapshot) => !eventSnapshot.data().deletedAt)
          .map((eventSnapshot) => mapEventData(eventSnapshot.id, eventSnapshot.data()));

        setRawEvents(nextEvents);
        setIsEventsLoading(false);
        setError(null);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("大会一覧の取得に失敗しました。管理者権限を確認してください。");
        setIsEventsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, collections.entries),
      (snapshot) => {
        const nextCounts: Record<string, number> = {};

        for (const entrySnapshot of snapshot.docs) {
          const data = entrySnapshot.data();
          const eventId = typeof data.eventId === "string" ? data.eventId : null;

          if (!eventId || !isCountableEntryStatus(data.entryStatus)) {
            continue;
          }

          const participantCount =
            typeof data.participantCount === "number" ? data.participantCount : 1;

          nextCounts[eventId] = (nextCounts[eventId] ?? 0) + participantCount;
        }

        setEntryCounts(nextCounts);
        setIsEntriesLoading(false);
      },
      (caughtError) => {
        console.error(caughtError);
        setError("エントリー人数の取得に失敗しました。");
        setIsEntriesLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const events = useMemo(
    () =>
      rawEvents.map((event) => ({
        ...event,
        entryCount: entryCounts[event.id] ?? 0,
      })),
    [entryCounts, rawEvents],
  );

  const visibleEvents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return events
      .filter((event) => {
        const matchesSearch =
          normalizedQuery.length === 0 ||
          event.title.toLowerCase().includes(normalizedQuery);
        const matchesStatus =
          statusFilter === "all" || event.status === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortKey === "createdAtDesc") {
          return (
            getComparableTime(b.createdAt, 0) - getComparableTime(a.createdAt, 0)
          );
        }

        if (sortKey === "eventDateDesc") {
          return (
            getComparableTime(b.eventDate, 0) - getComparableTime(a.eventDate, 0)
          );
        }

        return (
          getComparableTime(a.eventDate, Number.MAX_SAFE_INTEGER) -
          getComparableTime(b.eventDate, Number.MAX_SAFE_INTEGER)
        );
      });
  }, [events, searchQuery, sortKey, statusFilter]);

  const summary = useMemo(
    () => ({
      total: events.length,
      published: events.filter((event) => event.status === "published").length,
      draft: events.filter((event) => event.status === "draft").length,
      entries: events.reduce((sum, event) => sum + event.entryCount, 0),
    }),
    [events],
  );

  const isLoading = isEventsLoading || isEntriesLoading;

  function openCreateForm() {
    setEditingEvent(null);
    setIsFormOpen(true);
    setError(null);
  }

  function openEditForm(event: AdminEvent) {
    setEditingEvent(event);
    setIsFormOpen(true);
    setError(null);
  }

  function closeForm() {
    if (isSaving) {
      return;
    }

    setIsFormOpen(false);
    setEditingEvent(null);
  }

  async function saveEvent(values: EventFormValues, imageFile: File | null) {
    setIsSaving(true);
    setError(null);

    try {
      if (editingEvent) {
        const imagePayload = imageFile
          ? await uploadEventMainImage(editingEvent.id, imageFile)
          : {};

        await updateDoc(
          doc(db, collections.events, editingEvent.id),
          {
            ...createEventPayload(values),
            ...imagePayload,
          },
        );
        setToast("大会を更新しました。");
      } else {
        const eventRef = await addDoc(collection(db, collections.events), {
          ...createEventPayload(values),
          createdAt: serverTimestamp(),
        });

        if (imageFile) {
          const imagePayload = await uploadEventMainImage(eventRef.id, imageFile);
          await updateDoc(eventRef, imagePayload);
        }

        setToast("大会を作成しました。");
      }

      setIsFormOpen(false);
      setEditingEvent(null);
    } catch (caughtError) {
      console.error(caughtError);
      setError("保存に失敗しました。入力内容、画像ファイル、管理者権限を確認してください。");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(event: AdminEvent, status: EventStatus) {
    setError(null);

    try {
      await updateDoc(doc(db, collections.events, event.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      setToast(`ステータスを「${eventStatusLabels[status]}」に変更しました。`);
    } catch (caughtError) {
      console.error(caughtError);
      setError("ステータス変更に失敗しました。");
    }
  }

  async function deleteEvent(event: AdminEvent) {
    const confirmed = window.confirm(`「${event.title}」を削除しますか？`);

    if (!confirmed) {
      return;
    }

    setError(null);

    try {
      await updateDoc(doc(db, collections.events, event.id), {
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setToast("大会を削除しました。");
    } catch (caughtError) {
      console.error(caughtError);
      setError("削除に失敗しました。");
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-alma-gold">大会運営</p>
          <h1 className="mt-2 text-2xl font-bold text-white">大会管理</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            COPA ALMA の大会作成、公開設定、受付期間、エントリー状況を管理します。
          </p>
        </div>
        <Button onClick={openCreateForm}>大会を追加</Button>
      </div>

      {toast ? (
        <div className="fixed right-4 top-4 z-50 rounded-md border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm text-emerald-100 shadow-xl shadow-black/30">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">大会数</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">公開中</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.published}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-zinc-400">下書き</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.draft}</p>
        </div>
        <div className="rounded-lg border border-alma-gold/25 bg-alma-gold/10 p-4">
          <p className="text-sm text-zinc-300">エントリー人数</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.entries}名</p>
        </div>
      </div>

      <AdminEventsToolbar
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        sortKey={sortKey}
        onSearchQueryChange={setSearchQuery}
        onStatusFilterChange={setStatusFilter}
        onSortKeyChange={setSortKey}
      />

      <AdminEventsList
        events={visibleEvents}
        isLoading={isLoading}
        onEdit={openEditForm}
        onStatusChange={(event, status) => void updateStatus(event, status)}
        onDelete={(event) => void deleteEvent(event)}
      />

      {isFormOpen ? (
        <AdminEventFormModal
          key={editingEvent?.id ?? "new"}
          event={editingEvent}
          isSaving={isSaving}
          onClose={closeForm}
          onSubmit={saveEvent}
        />
      ) : null}
    </section>
  );
}
