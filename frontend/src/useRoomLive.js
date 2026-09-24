import { useEffect, useRef, useState } from 'react';
import { connectRoom } from './api/live.js';

export function useRoomLive(membership, enabled, { onRoom, onUnavailable }) {
  const [status, setStatus] = useState('connecting');
  const [fileRevision, setFileRevision] = useState(0);
  const callbacks = useRef({ onRoom, onUnavailable });
  callbacks.current = { onRoom, onUnavailable };
  useEffect(() => {
    if (!enabled || !membership) return;
    return connectRoom(membership, {
      onStatus: setStatus,
      onFiles: () => setFileRevision(value => value + 1),
      onRoom: room => callbacks.current.onRoom(room),
      onUnavailable: () => callbacks.current.onUnavailable(),
    });
    // Updated room timestamps/counts must not reconnect the same membership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership?.room.id, membership?.memberToken, enabled]);
  return { status, fileRevision };
}
