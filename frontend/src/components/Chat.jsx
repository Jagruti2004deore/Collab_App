import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';

export default function Chat({
  roomId,
  currentUser,
  stompClient,
  connected,
  
}) {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);

  const bottomRef     = useRef(null);
  const typingTimeout = useRef(null);
  const isTyping      = useRef(false);
  const subsRef       = useRef([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load history
  useEffect(() => {
    api.get(`/api/chat/${roomId}/history`)
      .then((res) => setMessages(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId]);

  // Subscribe once connected
  useEffect(() => {
  if (!stompClient || !connected) return;

  subsRef.current.forEach((s) => {
    try { s.unsubscribe(); } catch (e) { console.warn(e); }
  });
  subsRef.current = [];

  // Only subscribe to chat messages here
  const s1 = stompClient.subscribe(
    `/topic/room/${roomId}`,
    (frame) => {
      const msg = JSON.parse(frame.body);
      setMessages((prev) => [...prev, msg]);
    }
  );

  // Typing indicator only
  const s2 = stompClient.subscribe(
    `/topic/room/${roomId}/presence`,
    (frame) => {
      const p = JSON.parse(frame.body);
      if (p.eventType === 'TYPING') {
        setTypingUsers((prev) =>
          prev.includes(p.username) ? prev : [...prev, p.username]
        );
      }
      if (p.eventType === 'STOP_TYPING') {
        setTypingUsers((prev) => prev.filter((u) => u !== p.username));
      }
      // JOIN/LEAVE handled by RoomPage only
    }
  );

  subsRef.current = [s1, s2];

  return () => {
    subsRef.current.forEach((s) => {
      try { s.unsubscribe(); } catch (e) { console.warn(e); }
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [stompClient, connected, roomId]);
  
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!stompClient?.connected) return;

    if (!isTyping.current) {
      isTyping.current = true;
      stompClient.publish({
        destination: `/app/room/${roomId}/typing`,
        body: JSON.stringify({ eventType: 'TYPING' }),
      });
    }

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      isTyping.current = false;
      stompClient.publish({
        destination: `/app/room/${roomId}/typing`,
        body: JSON.stringify({ eventType: 'STOP_TYPING' }),
      });
    }, 2000);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !connected) return;

    clearTimeout(typingTimeout.current);
    if (isTyping.current) {
      isTyping.current = false;
      stompClient.publish({
        destination: `/app/room/${roomId}/typing`,
        body: JSON.stringify({ eventType: 'STOP_TYPING' }),
      });
    }

    stompClient.publish({
      destination: `/app/chat/${roomId}`,
      body: JSON.stringify({
        roomId,
        sender: currentUser,
        content: input.trim(),
        type: 'CHAT',
      }),
    });

    setInput('');
  };

  const formatTime = (sentAt) => {
    if (!sentAt) return '';
    return new Date(sentAt).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    });
  };

  const isMyMessage = (sender) => sender === currentUser;
  const othersTyping = typingUsers.filter((u) => u !== currentUser);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading messages...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      <div className={`text-xs px-4 py-1.5 text-center font-medium shrink-0
        ${connected
          ? 'bg-emerald-50 text-emerald-600'
          : 'bg-yellow-50 text-yellow-600'}`}>
        {connected ? '● Connected' : '○ Connecting...'}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-300 text-sm mt-10">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx}
              className={`flex flex-col
                ${isMyMessage(msg.sender) ? 'items-end' : 'items-start'}`}>
              {(idx === 0 || messages[idx - 1].sender !== msg.sender) && (
                <span className="text-xs text-gray-400 mb-1 px-1">
                  {isMyMessage(msg.sender) ? 'You' : msg.sender}
                </span>
              )}
              <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm
                ${isMyMessage(msg.sender)
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                {msg.content}
              </div>
              <span className="text-xs text-gray-300 mt-1 px-1">
                {formatTime(msg.sentAt)}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 h-6 shrink-0">
        {othersTyping.length > 0 && (
          <p className="text-xs text-gray-400 italic">
            {othersTyping.length === 1
              ? `${othersTyping[0]} is typing...`
              : `${othersTyping.join(', ')} are typing...`}
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 px-4 py-3 shrink-0">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            type="text"
            id="chatInput"
            value={input}
            onChange={handleInputChange}
            placeholder={connected ? 'Type a message...' : 'Connecting...'}
            disabled={!connected}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5
                       text-sm focus:outline-none focus:ring-2
                       focus:ring-indigo-500 disabled:bg-gray-50
                       disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={!connected || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white
                       px-4 py-2.5 rounded-xl text-sm font-medium
                       transition disabled:opacity-50">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}