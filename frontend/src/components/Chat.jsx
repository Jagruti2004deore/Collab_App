import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';

export default function Chat({ roomId, currentUser, stompClient, connected }) {
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(true);
  const [typingUsers, setTypingUsers]   = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  const bottomRef     = useRef(null);
  const typingTimeout = useRef(null);
  const isTyping      = useRef(false);
  const subsRef       = useRef([]);
  const fileInputRef  = useRef(null);

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

    const s1 = stompClient.subscribe(
      '/topic/room/' + roomId,
      (frame) => {
        const msg = JSON.parse(frame.body);
        setMessages((prev) => [...prev, msg]);
      }
    );

    const s2 = stompClient.subscribe(
      '/topic/room/' + roomId + '/presence',
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
      }
    );

    subsRef.current = [s1, s2];

    return () => {
      subsRef.current.forEach((s) => {
        try { s.unsubscribe(); } catch (e) { console.warn(e); }
      });
    };
  }, [stompClient, connected, roomId]);

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
    typingTimeout.current = setTimeout(() => {
      isTyping.current = false;
      stompClient.publish({
        destination: '/app/room/' + roomId + '/typing',
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
        destination: '/app/room/' + roomId + '/typing',
        body: JSON.stringify({ eventType: 'STOP_TYPING' }),
      });
    }

    stompClient.publish({
      destination: '/app/chat/' + roomId,
      body: JSON.stringify({
        roomId: roomId,
        sender: currentUser,
        content: input.trim(),
        type: 'CHAT',
      }),
    });

    setInput('');
  };

  const sendFile = (e) => {
    e.preventDefault();
    if (!selectedFile || !connected) return;

    const reader = new FileReader();
    reader.onload = () => {
      stompClient.publish({
        destination: '/app/chat/' + roomId,
        body: JSON.stringify({
          roomId: roomId,
          sender: currentUser,
          content: reader.result,
          type: 'FILE',
          fileName: selectedFile.name,
          fileType: selectedFile.type,
        }),
      });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const formatTime = (sentAt) => {
    if (!sentAt) return '';
    return new Date(sentAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isMyMessage = (sender) => sender === currentUser;

  const othersTyping = typingUsers.filter((u) => u !== currentUser);

  const renderContent = (msg) => {
    if (msg.type === 'FILE') {
      if (msg.fileType && msg.fileType.startsWith('image/')) {
        return (
          <img
            src={msg.content}
            alt={msg.fileName || 'image'}
            className="max-w-xs rounded-lg mt-1"
            style={{ maxHeight: 200 }}
          />
        );
      }
      return (
        <a
          href={msg.content}
          download={msg.fileName}
          className="underline text-xs mt-1 break-all block">
          {'[File] ' + (msg.fileName || 'download')}
        </a>
      );
    }
    return msg.content;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading messages...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      <div className={
        'text-xs px-4 py-1.5 text-center font-medium shrink-0 ' +
        (connected ? 'bg-emerald-50 text-emerald-600' : 'bg-yellow-50 text-yellow-600')
      }>
        {connected ? 'Connected' : 'Connecting...'}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-300 text-sm mt-10">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={
                'flex flex-col ' +
                (isMyMessage(msg.sender) ? 'items-end' : 'items-start')
              }>

              {(idx === 0 || messages[idx - 1].sender !== msg.sender) && (
                <span className="text-xs text-gray-400 mb-1 px-1">
                  {isMyMessage(msg.sender) ? 'You' : msg.sender}
                </span>
              )}

              <div className={
                'max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm break-words ' +
                (isMyMessage(msg.sender)
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm')
              }>
                {renderContent(msg)}
              </div>

              <span className="text-xs text-gray-300 mt-1 px-1">
                {formatTime(msg.sentAt)}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 h-6 shrink-0 flex items-center">
        {othersTyping.length > 0 ? (
          <span className="text-xs text-gray-400 italic">
            {othersTyping.length === 1
              ? othersTyping[0] + ' is typing...'
              : othersTyping.join(', ') + ' are typing...'}
          </span>
        ) : null}
      </div>

      {selectedFile ? (
        <div className="mx-4 mb-2 flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
          <span className="text-xs font-medium text-indigo-600 shrink-0">
            File:
          </span>
          <span className="text-xs text-indigo-700 truncate flex-1">
            {selectedFile.name}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="text-indigo-400 hover:text-red-400 text-xs transition shrink-0 font-medium">
            Remove
          </button>
        </div>
      ) : null}

      <div className="border-t border-gray-100 px-4 py-3 shrink-0">
        <form
          onSubmit={selectedFile ? sendFile : sendMessage}
          className="flex gap-2 items-center">

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
            onChange={(e) => {
              if (e.target.files[0]) {
                setSelectedFile(e.target.files[0]);
                setInput('');
              }
            }}
          />

          <button
            type="button"
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }}
            disabled={!connected}
            title="Attach file"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-500 hover:border-indigo-300 transition disabled:opacity-40 text-sm font-bold">
            +
          </button>

          <input
            type="text"
            id="chatInput"
            value={input}
            onChange={handleInputChange}
            placeholder={
              !connected
                ? 'Connecting...'
                : selectedFile
                ? 'File ready — click Send'
                : 'Type a message...'
            }
            disabled={!connected || selectedFile !== null}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
          />

          <button
            type="submit"
            disabled={!connected || (!input.trim() && !selectedFile)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50 shrink-0">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}