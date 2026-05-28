import { useEffect, useRef, useState } from 'react';

export default function Notes({ roomId, currentUser, stompClient, connected }) {
  const [content, setContent] = useState('');
  const [updatedBy, setUpdatedBy] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const subRef = useRef([]);
  const publishTimer = useRef(null);
  const remoteUpdate = useRef(false);

  useEffect(() => {
    if (!stompClient || !connected) return;

    subRef.current.forEach((sub) => {
      try { sub.unsubscribe(); } catch (e) { console.warn(e); }
    });

    const liveSub = stompClient.subscribe('/topic/notes/' + roomId, (frame) => {
      const note = JSON.parse(frame.body);
      remoteUpdate.current = true;
      setContent(note.content || '');
      setUpdatedBy(note.username || '');
      setUpdatedAt(note.updatedAt || '');
    });

    const historySub = stompClient.subscribe('/user/queue/notes-history', (frame) => {
      const note = JSON.parse(frame.body);
      remoteUpdate.current = true;
      setContent(note.content || '');
      setUpdatedBy(note.username || '');
      setUpdatedAt(note.updatedAt || '');
    });

    subRef.current = [liveSub, historySub];

    stompClient.publish({
      destination: '/app/notes/' + roomId,
      body: JSON.stringify({ action: 'HISTORY_REQ', roomId, username: currentUser }),
    });

    return () => {
      subRef.current.forEach((sub) => {
        try { sub.unsubscribe(); } catch (e) { console.warn(e); }
      });
    };
  }, [stompClient, connected, roomId, currentUser]);

  const publishNote = (nextContent) => {
    if (!stompClient?.connected) return;
    clearTimeout(publishTimer.current);
    publishTimer.current = setTimeout(() => {
      stompClient.publish({
        destination: '/app/notes/' + roomId,
        body: JSON.stringify({
          action: 'UPDATE',
          roomId,
          username: currentUser,
          content: nextContent,
        }),
      });
    }, 350);
  };

  const handleChange = (e) => {
    const next = e.target.value;
    setContent(next);
    if (remoteUpdate.current) {
      remoteUpdate.current = false;
      return;
    }
    publishNote(next);
  };

  const formatUpdatedAt = () => {
    if (!updatedAt) return 'Not saved yet';
    return new Date(updatedAt).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const saveNotes = () => {
    const blob = new Blob([content || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `room-notes-${roomId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-950">Shared notepad</h2>
          <p className="text-xs text-slate-500">Autosaves for everyone in this room.</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
          {updatedBy ? `Last edit: ${updatedBy} - ${formatUpdatedAt()}` : formatUpdatedAt()}
        </div>
        <button
          onClick={saveNotes}
          className="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700">
          Save notes
        </button>
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        disabled={!connected}
        title={updatedBy ? `Last edit by ${updatedBy}` : 'Shared room notes'}
        placeholder="Write interview notes, questions, decisions, feedback, or follow-up tasks..."
        className="h-full flex-1 border-0 bg-white p-4 text-sm leading-7 text-slate-800 outline-none disabled:bg-slate-50 sm:p-6"
      />
    </div>
  );
}
