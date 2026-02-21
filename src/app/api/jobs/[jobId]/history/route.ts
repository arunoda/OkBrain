import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobHistory } from '@/lib/jobs';
import { getSession } from '@/lib/auth';

// GET /api/jobs/:jobId/history - Get job history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await getSession();
    const userId = session?.userId ?? null;

    const { jobId } = await params;
    const { searchParams } = new URL(request.url);
    const sinceSeq = parseInt(searchParams.get('since_seq') || '0', 10);

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Validate ownership: if job has a user_id, only the owner can access history
    if (job.user_id && job.user_id !== userId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const events = await getJobHistory(jobId, sinceSeq);
    return NextResponse.json({
      events: events.map(e => ({
        ...e,
        payload: JSON.parse(e.payload)
      })),
      next_seq: events.length > 0 ? events[events.length - 1].seq : sinceSeq
    });
  } catch (error) {
    console.error('[API] Error getting job history:', error);
    return NextResponse.json({ error: 'Failed to get job history' }, { status: 500 });
  }
}
