'use client';

import { ReviewWorkspace } from '@/components/review/review-workspace';
import { useSocket } from '@/hooks/use-socket';

interface Props {
  params: { id: string };
}

export default function ReviewPage({ params }: Props) {
  const { id } = params;
  // Wire Socket.IO globally for this page
  useSocket();

  return (
    <div style={{ height: 'calc(100vh - 56px)' }}>
      <ReviewWorkspace reviewId={id} />
    </div>
  );
}
