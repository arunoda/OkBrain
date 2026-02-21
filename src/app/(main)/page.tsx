import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDocument, getUserById, getUserKV } from "@/lib/db";
import { getJob, getJobHistory } from "@/lib/jobs";
import { isValidModelId } from "@/lib/ai";
import ChatWrapper from "./ChatWrapper";

type HighlightView = "today" | "tomorrow" | "week";

// Reconstruct highlight text from job history output events
async function getHighlightFromJob(jobId: string): Promise<string | null> {
  const events = await getJobHistory(jobId);
  const outputEvents = events.filter(e => e.kind === 'output');
  if (outputEvents.length === 0) return null;

  return outputEvents
    .map(e => {
      const payload = JSON.parse(e.payload);
      return payload.text || '';
    })
    .join('');
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const docIdsParam = params.documentIds;

  // Normalize docIds into an array
  const documentIds: string[] = [];
  if (docIdsParam) {
    if (Array.isArray(docIdsParam)) {
      documentIds.push(...docIdsParam);
    } else {
      documentIds.push(docIdsParam);
    }
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const user = await getUserById(session.userId);
  if (!user) {
    redirect("/login");
  }

  const initialDocumentContexts: { id: string; title: string }[] = [];
  if (documentIds.length > 0 && session) {
    for (const id of documentIds) {
      const doc = await getDocument(session.userId, id);
      if (doc) {
        initialDocumentContexts.push({ id: doc.id, title: doc.title });
      }
    }
  }

  // Fetch verify model preference for SSR
  let initialVerifyModel: string | null = null;
  if (session) {
    const verifyModelKV = await getUserKV(session.userId, "verify:model");
    if (verifyModelKV?.value && isValidModelId(verifyModelKV.value)) {
      initialVerifyModel = verifyModelKV.value;
    }
  }

  // Fetch highlights for SSR using job system
  let initialHighlightsData = null;
  if (session) {
    const promptKV = await getUserKV(session.userId, "highlights:prompt");

    const views: Record<string, {
      highlight: string | null;
      lastRunAt: string | null;
      jobId: string;
      jobState: string | null;
      isRunning: boolean;
    }> = {};

    for (const view of ["today", "tomorrow", "week"] as HighlightView[]) {
      const jobId = `highlights:${session.userId}:${view}`;
      const job = await getJob(jobId);

      // Get highlight from job history if job succeeded
      const highlight = job?.state === 'succeeded'
        ? await getHighlightFromJob(jobId)
        : null;

      views[view] = {
        highlight,
        lastRunAt: job?.state === 'succeeded' ? job.updated_at : null,
        jobId,
        jobState: job?.state || null,
        isRunning: job?.state === 'running' || job?.state === 'stopping',
      };
    }

    initialHighlightsData = {
      prompt: promptKV?.value || "Show me events and interesting things.",
      views,
    };
  }

  return (
    <Suspense fallback={
      <div className="messages-container">
        <div className="empty-state">
          <h2>Loading...</h2>
        </div>
      </div>
    }>
      <ChatWrapper
        initialDocumentContexts={initialDocumentContexts}
        initialHighlightsData={initialHighlightsData}
        initialVerifyModel={initialVerifyModel}
      />
    </Suspense>
  );
}
