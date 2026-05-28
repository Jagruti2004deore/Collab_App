import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';

export default function Chat({ roomId, currentUser, stompClient, connected }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);
  const isTyping = useRef(false);
  const subsRef = useRef([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    api.get('/api/chat/' + roomId + '/history')
      .then((res) => setMessages(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId]);

  useEffect(() => {
    if (!stompClient || !connected) return;

    subsRef.current.forEach((s) => {
      try { s.unsubscribe(); } catch (e) { console.warn(e); }
    });
    subsRef.current = [];

    const chatSub = stompClient.subscribe('/topic/room/' + roomId, (frame) => {
      const msg = JSON.parse(frame.body);
      setMessages((prev) => [...prev, msg]);
    });

    const presenceSub = stompClient.subscribe('/topic/room/' + roomId + '/presence', (frame) => {
      const p = JSON.parse(frame.body);
      if (p.eventType === 'TYPING') {
        setTypingUsers((prev) =>
          prev.includes(p.username) ? prev : [...prev, p.username]
        );
      }
      if (p.eventType === 'STOP_TYPING') {
        setTypingUsers((prev) => prev.filter((u) => u !== p.username));
      }
    });

    subsRef.current = [chatSub, presenceSub];

    return () => {
      subsRef.current.forEach((s) => {
        try { s.unsubscribe(); } catch (e) { console.warn(e); }
      });
    };
  }, [stompClient, connected, roomId]);

  const stopTyping = () => {
    clearTimeout(typingTimeout.current);
    if (isTyping.current && stompClient?.connected) {
      isTyping.current = false;
      stompClient.publish({
        destination: '/app/room/' + roomId + '/typing',
        body: JSON.stringify({ eventType: 'STOP_TYPING' }),
      });
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!stompClient?.connected) return;

    if (!isTyping.current) {
      isTyping.current = true;
      stompClient.publish({
        destination: '/app/room/' + roomId + '/typing',
        body: JSON.stringify({ eventType: 'TYPING' }),
      });
    }

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(stopTyping, 1800);
  };

  const publishChat = (payload) => {
    stompClient.publish({
      destination: '/app/chat/' + roomId,
      body: JSON.stringify(payload),
    });
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !connected) return;
    stopTyping();
    publishChat({
      roomId,
      sender: currentUser,
      content: input.trim(),
      type: 'CHAT',
    });
    setInput('');
  };

  const sendFile = (e) => {
    e.preventDefault();
    if (!selectedFile || !connected) return;

    if (selectedFile.size > 8 * 1024 * 1024) {
      alert('File too large. Please select a file under 8MB for chat sharing.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    api.post('/api/chat/' + roomId + '/files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(() => {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }).catch((err) => {
      alert(err.response?.data?.message || 'Failed to upload file. Please try again.');
    });
  };

  const formatTime = (sentAt) => {
    if (!sentAt) return '';
    return new Date(sentAt).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const isMyMessage = (sender) => sender === currentUser;
  const othersTyping = typingUsers.filter((u) => u !== currentUser);

  const renderContent = (msg, mine) => {
    if (msg.type === 'FILE') {
      if (msg.fileType && msg.fileType.startsWith('image/')) {
        return (
          <a href={msg.content} download={msg.fileName} className="block">
            <img
              src={msg.content}
              alt={msg.fileName || 'shared image'}
              className="mt-1 max-h-64 max-w-full rounded-2xl border border-white/20 object-contain"
            />
            <span className="mt-2 block text-xs font-semibold opacity-80">
              {msg.fileName || 'image'}
            </span>
          </a>
        );
      }
      return (
        <a
          href={msg.content}
          download={msg.fileName}
          className={
            'mt-1 block rounded-2xl px-3 py-2 text-xs font-bold underline break-all ' +
            (mine ? 'bg-white/15 text-white' : 'bg-white text-slate-700')
          }>
          Download {msg.fileName || 'file'}
        </a>
      );
    }
    return msg.content;
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Loading messages...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className={
        'shrink-0 px-4 py-2 text-center text-xs font-bold ' +
        (connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
      }>
        {connected ? 'Connected' : 'Connecting...'}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
        {messages.length === 0 ? (
          <div className="mt-10 text-center text-sm text-slate-400">
            No messages yet. Start the interview chat.
          </div>
        ) : (
          messages.map((msg, idx) => {
            const mine = isMyMessage(msg.sender);
            return (
              <div key={idx} className={'flex flex-col ' + (mine ? 'items-end' : 'items-start')}>
                {(idx === 0 || messages[idx - 1].sender !== msg.sender) && (
                  <span className="mb-1 px-1 text-xs font-bold text-slate-400">
                    {mine ? 'You' : msg.sender}
                  </span>
                )}
                <div className={
                  'max-w-[84vw] break-words rounded-3xl px-4 py-2.5 text-sm shadow-sm sm:max-w-sm lg:max-w-md ' +
                  (mine
                    ? 'rounded-tr-md bg-blue-600 text-white'
                    : 'rounded-tl-md border border-slate-200 bg-white text-slate-800')
                }>
                  {renderContent(msg, mine)}
                </div>
                <span className="mt-1 px-1 text-[11px] text-slate-400">
                  {formatTime(msg.sentAt)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex h-6 shrink-0 items-center px-4">
        {othersTyping.length > 0 && (
          <span className="text-xs italic text-slate-400">
            {othersTyping.length === 1
              ? othersTyping[0] + ' is typing...'
              : othersTyping.join(', ') + ' are typing...'}
          </span>
        )}
      </div>

      {selectedFile && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
          <span className="shrink-0 text-xs font-black text-blue-700">File</span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-blue-800">
            {selectedFile.name}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="shrink-0 text-xs font-bold text-slate-500 hover:text-red-600">
            Remove
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
        <form onSubmit={selectedFile ? sendFile : sendMessage} className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar,.java,.py,.c,.cpp,.js"
            onChange={(e) => {
              if (e.target.files[0]) {
                setSelectedFile(e.target.files[0]);
                setInput('');
              }
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!connected}
            title="Attach file"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-xl font-black text-slate-500 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-40">
            +
          </button>

          <input
            type="text"
            id="chatInput"
            value={input}
            onChange={handleInputChange}
            placeholder={!connected ? 'Connecting...' : selectedFile ? 'File ready - click Send' : 'Type a message...'}
            disabled={!connected || selectedFile !== null}
            className="focus-ring min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          />

          <button
            type="submit"
            disabled={!connected || (!input.trim() && !selectedFile)}
            className="shrink-0 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
