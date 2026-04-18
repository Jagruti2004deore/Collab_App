import { useEffect, useRef, useState, useCallback } from 'react';

export default function Whiteboard({ roomId, currentUser, stompClient, connected }) {
  const canvasRef     = useRef(null);
  const isDrawing     = useRef(false);
  const lastPos       = useRef({ x: 0, y: 0 });
  const historyRef    = useRef([]);
  const subsRef       = useRef([]);

  const [tool, setTool]           = useState('pen');
  const [color, setColor]         = useState('#3730a3');
  const [lineWidth, setLineWidth] = useState(3);
  const [tooltip, setTooltip]     = useState(null);
  // tooltip = { x, y, username } | null

  const COLORS = [
    '#3730a3','#000000','#ef4444','#f97316',
    '#eab308','#22c55e','#3b82f6','#a855f7',
    '#ec4899','#ffffff',
  ];

  // User colors for attribution
  const USER_COLORS = [
    '#7c3aed','#0369a1','#047857','#b45309',
    '#be123c','#0891b2','#4338ca','#065f46',
  ];

  const getUserColor = (username) => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const drawStroke = useCallback((msg) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (msg.action === 'CLEAR') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      historyRef.current = [];
      return;
    }

    if (msg.action !== 'DRAW') return;

    ctx.beginPath();
    ctx.moveTo(msg.x0, msg.y0);
    ctx.lineTo(msg.x1, msg.y1);
    ctx.strokeStyle = msg.isEraser ? '#ffffff' : msg.color;
    ctx.lineWidth   = msg.lineWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    ctx.closePath();
  }, []);

  const handleIncomingMessage = useCallback((msg) => {
    if (msg.username === currentUser && msg.action === 'DRAW') return;
    drawStroke(msg);
    if (msg.action === 'DRAW') {
      historyRef.current.push(msg);
    } else if (msg.action === 'CLEAR') {
      historyRef.current = [];
    }
  }, [currentUser, drawStroke]);

  useEffect(() => {
    if (!stompClient || !connected) return;

    subsRef.current.forEach((s) => {
      try { s.unsubscribe(); } catch (e) { console.warn(e); }
    });
    subsRef.current = [];

    const s1 = stompClient.subscribe(
      `/topic/whiteboard/${roomId}`,
      (frame) => {
        const msg = JSON.parse(frame.body);
        handleIncomingMessage(msg);
      }
    );

    const s2 = stompClient.subscribe(
      `/user/queue/whiteboard-history`,
      (frame) => {
        const stroke = JSON.parse(frame.body);
        drawStroke(stroke);
        historyRef.current.push(stroke);
      }
    );

    subsRef.current = [s1, s2];

    stompClient.publish({
      destination: `/app/whiteboard/${roomId}`,
      body: JSON.stringify({
        action: 'HISTORY_REQ',
        roomId,
        username: currentUser,
      }),
    });

    return () => {
      subsRef.current.forEach((s) => {
        try { s.unsubscribe(); } catch (e) { console.warn(e); }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stompClient, connected, roomId]);

  const publishStroke = useCallback((x0, y0, x1, y1) => {
    if (!stompClient?.connected) return;

    const usingEraser = tool === 'eraser';
    const msg = {
      action:    'DRAW',
      x0, y0, x1, y1,
      color,
      lineWidth: usingEraser ? lineWidth * 4 : lineWidth,
      isEraser:  usingEraser,
      username:  currentUser,
      roomId,
    };

    drawStroke(msg);
    historyRef.current.push(msg);

    stompClient.publish({
      destination: `/app/whiteboard/${roomId}`,
      body: JSON.stringify(msg),
    });
  }, [stompClient, color, lineWidth, tool, currentUser, roomId, drawStroke]);

  const getPos = (e, canvas) => {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const pos = getPos(e, canvasRef.current);
    isDrawing.current = true;
    lastPos.current   = pos;
    setTooltip(null);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const pos = getPos(e, canvasRef.current);
    publishStroke(lastPos.current.x, lastPos.current.y, pos.x, pos.y);
    lastPos.current = pos;
  };

  const stopDrawing = (e) => {
    e.preventDefault();
    isDrawing.current = false;
  };

  // Hover — find nearest stroke and show who drew it
  const handleMouseMove = (e) => {
    if (isDrawing.current) return;

    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;

    const THRESHOLD = 12;
    let found = null;

    // Check from newest stroke to oldest
    for (let i = historyRef.current.length - 1; i >= 0; i--) {
      const s = historyRef.current[i];
      if (s.isEraser) continue;

      // Distance from point to line segment
      const dx = s.x1 - s.x0;
      const dy = s.y1 - s.y0;
      const lenSq = dx * dx + dy * dy;
      let dist;

      if (lenSq === 0) {
        dist = Math.hypot(mx - s.x0, my - s.y0);
      } else {
        const t = Math.max(0, Math.min(1,
          ((mx - s.x0) * dx + (my - s.y0) * dy) / lenSq
        ));
        dist = Math.hypot(mx - (s.x0 + t * dx), my - (s.y0 + t * dy));
      }

      if (dist < THRESHOLD + s.lineWidth / 2) {
        found = s;
        break;
      }
    }

    if (found) {
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 36,
        username: found.username,
      });
    } else {
      setTooltip(null);
    }
  };

  const clearCanvas = () => {
    if (!stompClient?.connected) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
    stompClient.publish({
      destination: `/app/whiteboard/${roomId}`,
      body: JSON.stringify({
        action: 'CLEAR', roomId, username: currentUser,
      }),
    });
  };

  const cursorStyle = tool === 'eraser' ? 'cell' : 'crosshair';

  return (
    <div className="flex flex-col h-full">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b
                      border-gray-100 flex-wrap shrink-0 bg-gray-50">
        <div className="flex gap-1">
          <button onClick={() => setTool('pen')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition
              ${tool === 'pen'
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
            ✏️ Pen
          </button>
          <button onClick={() => setTool('eraser')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition
              ${tool === 'eraser'
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
            🧹 Eraser
          </button>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        <div className="flex gap-1.5 items-center">
          {COLORS.map((c) => (
            <button key={c}
              onClick={() => { setColor(c); setTool('pen'); }}
              className={`w-5 h-5 rounded-full border-2 transition
                ${color === c && tool === 'pen'
                  ? 'border-indigo-500 scale-125'
                  : 'border-gray-300 hover:scale-110'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Size</span>
          <input type="range" min="1" max="20" value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="w-20 accent-indigo-600" />
          <span className="text-xs text-gray-500 w-4">{lineWidth}</span>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        <button onClick={clearCanvas}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white
                     border border-red-200 text-red-500 hover:bg-red-50
                     transition ml-auto">
          🗑️ Clear All
        </button>
      </div>

      {/* Canvas with tooltip */}
      <div className="flex-1 overflow-hidden relative bg-white">
        <canvas
          ref={canvasRef}
          width={1200}
          height={800}
          style={{ cursor: cursorStyle, touchAction: 'none' }}
          className="w-full h-full"
          onMouseDown={startDrawing}
          onMouseMove={(e) => { draw(e); handleMouseMove(e); }}
          onMouseUp={stopDrawing}
          onMouseLeave={(e) => { stopDrawing(e); setTooltip(null); }}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {/* Hover tooltip */}
        {tooltip && (
          <div
            style={{
  position: 'absolute',
  left: `${tooltip.x + 12}px`,
  top: `${tooltip.y}px`,
  pointerEvents: 'none',
}}
            className="flex items-center gap-1.5 bg-gray-800 text-white
                       text-xs px-2.5 py-1.5 rounded-lg shadow-lg
                       whitespace-nowrap z-10">
            <span
              style={{
             width: '8px',
             height: '8px',
             borderRadius: '50%',
             background: getUserColor(tooltip.username),
             display: 'inline-block',
             flexShrink: 0,
             }}
            />
            {tooltip.username === currentUser ? 'You' : tooltip.username}
          </div>
        )}

        {!connected && (
          <div className="absolute inset-0 bg-white bg-opacity-80
                          flex items-center justify-center">
            <p className="text-gray-400 text-sm">
              Connecting to whiteboard...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}