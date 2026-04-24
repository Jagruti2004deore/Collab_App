import { useEffect, useRef, useState, useCallback } from 'react';

export default function Whiteboard({ roomId, currentUser, stompClient, connected }) {
  const canvasRef  = useRef(null);
  const isDrawing  = useRef(false);
  const lastPos    = useRef({ x: 0, y: 0 });
  const historyRef = useRef([]);
  const subsRef    = useRef([]);

  const [tool, setTool]           = useState('pen');
  const [color, setColor]         = useState('#3730a3');
  const [lineWidth, setLineWidth] = useState(3);
  const [tooltip, setTooltip]     = useState(null);
  const [activeTab, setActiveTab] = useState('canvas');
  const [savedPages, setSavedPages] = useState([]);
  const [viewingPage, setViewingPage] = useState(null);

  const COLORS = [
    '#3730a3','#000000','#ef4444','#f97316',
    '#eab308','#22c55e','#3b82f6','#a855f7',
    '#ec4899','#ffffff',
  ];

  const USER_COLORS = [
    '#7c3aed','#0369a1','#047857','#b45309',
    '#be123c','#0891b2','#4338ca','#065f46',
  ];

  const getUserColor = useCallback((username) => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
  }, []);

  // Init canvas white background
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
      '/topic/whiteboard/' + roomId,
      (frame) => {
        const msg = JSON.parse(frame.body);
        handleIncomingMessage(msg);
      }
    );

    const s2 = stompClient.subscribe(
      '/user/queue/whiteboard-history',
      (frame) => {
        const stroke = JSON.parse(frame.body);
        drawStroke(stroke);
        historyRef.current.push(stroke);
      }
    );

    subsRef.current = [s1, s2];

    stompClient.publish({
      destination: '/app/whiteboard/' + roomId,
      body: JSON.stringify({
        action: 'HISTORY_REQ',
        roomId: roomId,
        username: currentUser,
      }),
    });

    return () => {
      subsRef.current.forEach((s) => {
        try { s.unsubscribe(); } catch (e) { console.warn(e); }
      });
    };
  }, [stompClient, connected, roomId, handleIncomingMessage, drawStroke, currentUser]);

  const publishStroke = useCallback((x0, y0, x1, y1) => {
    if (!stompClient?.connected) return;
    const usingEraser = tool === 'eraser';
    const msg = {
      action:    'DRAW',
      x0, y0, x1, y1,
      color:     color,
      lineWidth: usingEraser ? lineWidth * 4 : lineWidth,
      isEraser:  usingEraser,
      username:  currentUser,
      roomId:    roomId,
    };
    drawStroke(msg);
    historyRef.current.push(msg);
    stompClient.publish({
      destination: '/app/whiteboard/' + roomId,
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

    for (let i = historyRef.current.length - 1; i >= 0; i--) {
      const s = historyRef.current[i];
      if (s.isEraser) continue;
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
      destination: '/app/whiteboard/' + roomId,
      body: JSON.stringify({
        action: 'CLEAR', roomId: roomId, username: currentUser,
      }),
    });
  };

  // Save current canvas as a page in history then clear for new page
  const savePage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if canvas has any content
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasContent = imageData.data.some((v, i) => {
      // Check if any pixel is not white (255,255,255,255)
      return i % 4 !== 3 && v !== 255;
    });

    if (!hasContent) {
      alert('Canvas is empty. Draw something before saving.');
      return;
    }

    const snapshot = canvas.toDataURL('image/png');
    const now      = new Date();
    const label    = 'Page ' + (savedPages.length + 1) + ' — ' +
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
      ' by ' + currentUser;

    const newPage = {
      id:        Date.now(),
      label:     label,
      image:     snapshot,
      savedAt:   now.toISOString(),
      savedBy:   currentUser,
      pageNum:   savedPages.length + 1,
    };

    setSavedPages((prev) => [...prev, newPage]);

    // Clear canvas for new page
    clearCanvas();

    // Switch to history tab briefly to show the save
    setActiveTab('history');
    setTimeout(() => setActiveTab('canvas'), 1200);
  };

  // Download a saved page as PNG
  const downloadPage = (page) => {
    const a    = document.createElement('a');
    a.href     = page.image;
    a.download = 'whiteboard-page-' + page.pageNum + '.png';
    a.click();
  };

  // Delete a saved page
  const deletePage = (id) => {
    setSavedPages((prev) => prev.filter((p) => p.id !== id));
    if (viewingPage && viewingPage.id === id) {
      setViewingPage(null);
    }
  };

  const cursorStyle = tool === 'eraser' ? 'cell' : 'crosshair';

  const tooltipStyle = tooltip ? {
    position:      'absolute',
    left:          tooltip.x + 12 + 'px',
    top:           tooltip.y + 'px',
    pointerEvents: 'none',
  } : {};

  const dotStyle = (username) => ({
    display:     'inline-block',
    flexShrink:  0,
    borderRadius: '50%',
    background:  getUserColor(username),
    width:       '8px',
    height:      '8px',
  });

  return (
    <div className="flex flex-col h-full">

      {/* Top tab bar */}
      <div className="flex items-center border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={() => setActiveTab('canvas')}
          className={
            'px-4 py-2 text-xs font-medium border-b-2 transition ' +
            (activeTab === 'canvas'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700')
          }>
          Canvas
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={
            'px-4 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1 ' +
            (activeTab === 'history'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700')
          }>
          History
          {savedPages.length > 0 && (
            <span className={
              'text-xs rounded-full px-1.5 py-0.5 font-semibold ' +
              (activeTab === 'history'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-600')
            }>
              {savedPages.length}
            </span>
          )}
        </button>
      </div>

      {/* ── CANVAS TAB ── */}
      {activeTab === 'canvas' && (
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Drawing toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b
                          border-gray-100 flex-wrap shrink-0 bg-gray-50">

            {/* Tool buttons */}
            <div className="flex gap-1">
              <button onClick={() => setTool('pen')}
                className={
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                  (tool === 'pen'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100')
                }>
                Pen
              </button>
              <button onClick={() => setTool('eraser')}
                className={
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                  (tool === 'eraser'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100')
                }>
                Eraser
              </button>
            </div>

            <div className="w-px h-5 bg-gray-200" />

            {/* Colors */}
            <div className="flex gap-1.5 items-center">
              {COLORS.map((c) => (
                <button key={c}
                  onClick={() => { setColor(c); setTool('pen'); }}
                  className={
                    'w-5 h-5 rounded-full border-2 transition ' +
                    (color === c && tool === 'pen'
                      ? 'border-indigo-500 scale-125'
                      : 'border-gray-300 hover:scale-110')
                  }
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <div className="w-px h-5 bg-gray-200" />

            {/* Size */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Size</span>
              <input type="range" min="1" max="20" value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-20 accent-indigo-600" />
              <span className="text-xs text-gray-500 w-4">{lineWidth}</span>
            </div>

            <div className="w-px h-5 bg-gray-200" />

            {/* Save page button */}
            <button onClick={savePage}
              className="px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-emerald-600 hover:bg-emerald-700 text-white
                         transition flex items-center gap-1">
              Save Page
            </button>

            {/* Clear button */}
            <button onClick={clearCanvas}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white
                         border border-red-200 text-red-500 hover:bg-red-50
                         transition">
              Clear
            </button>
          </div>

          {/* Page indicator */}
          <div className="px-4 py-1 bg-indigo-50 shrink-0 flex items-center
                          justify-between">
            <span className="text-xs text-indigo-600 font-medium">
              {'Current page: ' + (savedPages.length + 1)}
            </span>
            {savedPages.length > 0 && (
              <span className="text-xs text-gray-400">
                {savedPages.length + ' page' +
                  (savedPages.length > 1 ? 's' : '') + ' saved'}
              </span>
            )}
          </div>

          {/* Canvas */}
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

            {/* Tooltip */}
            {tooltip && (
              <div style={tooltipStyle}
                className="flex items-center gap-1.5 bg-gray-800 text-white
                           text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap z-10">
                <span style={dotStyle(tooltip.username)} />
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
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div className="flex flex-1 overflow-hidden">

          {/* Page list sidebar */}
          <div className="w-48 border-r border-gray-100 bg-gray-50
                          flex flex-col overflow-y-auto shrink-0">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase
                            tracking-wide">
                Saved Pages
              </p>
            </div>

            {savedPages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center
                              px-4 text-center">
                <p className="text-gray-300 text-xs leading-5">
                  No pages saved yet.
                  Switch to Canvas, draw something and click Save Page.
                </p>
              </div>
            ) : (
              savedPages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setViewingPage(page)}
                  className={
                    'w-full text-left px-3 py-2.5 border-b border-gray-100 ' +
                    'flex flex-col gap-1 transition hover:bg-white ' +
                    (viewingPage && viewingPage.id === page.id
                      ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                      : '')
                  }>
                  {/* Thumbnail */}
                  <img
                    src={page.image}
                    alt={'Page ' + page.pageNum}
                    style={{
                      width: '100%',
                      height: 60,
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '1px solid #e5e7eb',
                    }}
                  />
                  <span className="text-xs font-medium text-gray-700">
                    {'Page ' + page.pageNum}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(page.savedAt).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="text-xs text-gray-400">
                    by {page.savedBy}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Page viewer */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {viewingPage ? (
              <>
                {/* Viewer toolbar */}
                <div className="flex items-center justify-between px-4 py-2
                                border-b border-gray-100 bg-gray-50 shrink-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      {viewingPage.label}
                    </p>
                    <p className="text-xs text-gray-400">
                      Saved by {viewingPage.savedBy} at{' '}
                      {new Date(viewingPage.savedAt).toLocaleTimeString([], {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadPage(viewingPage)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium
                                 bg-indigo-600 hover:bg-indigo-700 text-white
                                 transition">
                      Download PNG
                    </button>
                    <button
                      onClick={() => deletePage(viewingPage.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium
                                 bg-white border border-red-200 text-red-500
                                 hover:bg-red-50 transition">
                      Delete
                    </button>
                  </div>
                </div>

                {/* Full page image */}
                <div className="flex-1 overflow-auto p-4 flex items-start
                                justify-center bg-gray-100">
                  <img
                    src={viewingPage.image}
                    alt={viewingPage.label}
                    style={{
                      maxWidth: '100%',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      background: '#fff',
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center
                              text-center px-8">
                {savedPages.length === 0 ? (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-gray-100
                                    flex items-center justify-center
                                    mb-4 text-2xl">
                      📋
                    </div>
                    <p className="text-gray-500 font-medium text-sm mb-1">
                      No saved pages yet
                    </p>
                    <p className="text-gray-300 text-xs leading-5">
                      Draw on the canvas, then click Save Page
                      to save it here. Each saved page gets
                      a thumbnail you can click to view.
                    </p>
                    <button
                      onClick={() => setActiveTab('canvas')}
                      className="mt-4 px-4 py-2 rounded-lg bg-indigo-600
                                 text-white text-xs font-medium
                                 hover:bg-indigo-700 transition">
                      Go to Canvas
                    </button>
                  </>
                ) : (
                  <p className="text-gray-300 text-sm">
                    Select a page from the left to view it
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}