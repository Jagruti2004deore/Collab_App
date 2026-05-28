import { useEffect, useMemo, useRef, useState } from 'react';

const STARTER_CODE = {
  javascript: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}

console.log(twoSum([2, 7, 11, 15], 9));`,
  python: `def two_sum(nums, target):
    seen = {}
    for i, value in enumerate(nums):
        need = target - value
        if need in seen:
            return [seen[need], i]
        seen[value] = i
    return []

print(two_sum([2, 7, 11, 15], 9))`,
  java: `class Main {
    public static void main(String[] args) {
        System.out.println("Add your Java solution here");
    }
}`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Add your C++ solution here" << endl;
    return 0;
}`,
  c: `#include <stdio.h>

int main() {
    printf("Add your C solution here\\n");
    return 0;
}`,
};

export default function CodeEditor({ roomId, currentUser, stompClient, connected }) {
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState(STARTER_CODE.javascript);
  const [output, setOutput] = useState('Output will appear here.');
  const [updatedBy, setUpdatedBy] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const subsRef = useRef([]);
  const publishTimerRef = useRef(null);
  const remoteUpdateRef = useRef(false);

  const languageLabel = useMemo(() => ({
    javascript: 'JavaScript',
    python: 'Python',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
  }[language]), [language]);

  useEffect(() => {
    if (!stompClient || !connected) return;

    subsRef.current.forEach((sub) => {
      try { sub.unsubscribe(); } catch (e) { console.warn(e); }
    });

    const liveSub = stompClient.subscribe('/topic/code/' + roomId, (frame) => {
      const payload = JSON.parse(frame.body);
      remoteUpdateRef.current = true;
      setLanguage(payload.language || 'javascript');
      setCode(payload.code || '');
      setUpdatedBy(payload.username || '');
      setUpdatedAt(payload.updatedAt || '');
    });

    const historySub = stompClient.subscribe('/user/queue/code-history', (frame) => {
      const payload = JSON.parse(frame.body);
      if (payload.code) {
        remoteUpdateRef.current = true;
        setLanguage(payload.language || 'javascript');
        setCode(payload.code || '');
        setUpdatedBy(payload.username || '');
        setUpdatedAt(payload.updatedAt || '');
      }
    });

    subsRef.current = [liveSub, historySub];
    stompClient.publish({
      destination: '/app/code/' + roomId,
      body: JSON.stringify({ action: 'HISTORY_REQ', roomId, username: currentUser }),
    });

    return () => {
      subsRef.current.forEach((sub) => {
        try { sub.unsubscribe(); } catch (e) { console.warn(e); }
      });
    };
  }, [stompClient, connected, roomId, currentUser]);

  const publishCode = (nextLanguage, nextCode) => {
    if (!stompClient?.connected) return;
    clearTimeout(publishTimerRef.current);
    publishTimerRef.current = setTimeout(() => {
      stompClient.publish({
        destination: '/app/code/' + roomId,
        body: JSON.stringify({
          action: 'UPDATE',
          roomId,
          username: currentUser,
          language: nextLanguage,
          code: nextCode,
        }),
      });
    }, 350);
  };

  const changeLanguage = (nextLanguage) => {
    const nextCode = STARTER_CODE[nextLanguage];
    setLanguage(nextLanguage);
    setCode(nextCode);
    publishCode(nextLanguage, nextCode);
    setOutput('Output will appear here.');
  };

  const changeCode = (nextCode) => {
    setCode(nextCode);
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false;
      return;
    }
    publishCode(language, nextCode);
  };

  const runCode = () => {
    if (language !== 'javascript') {
      setOutput(
        `${languageLabel} execution needs a secure backend sandbox. The live editor is ready for Java, C++, Python and C, but running those languages should be connected to a Docker/Judge0 worker before production.`
      );
      return;
    }

    const logs = [];
    const originalLog = console.log;
    try {
      console.log = (...args) => logs.push(args.map(String).join(' '));
      // Browser-only JavaScript runner for interview snippets.
      new Function(code)();
      setOutput(logs.length ? logs.join('\n') : 'Program finished without output.');
    } catch (e) {
      setOutput(e.message);
    } finally {
      console.log = originalLog;
    }
  };

  const saveCode = () => {
    const extension = {
      javascript: 'js',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
    }[language] || 'txt';
    const blob = new Blob([code || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `room-code-${roomId}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formattedUpdatedAt = updatedAt
    ? new Date(updatedAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : 'Not synced yet';

  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex flex-col gap-3 border-b border-white/10 bg-slate-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black">Live coding workspace</h2>
          <p className="text-xs text-slate-400">
            {updatedBy ? `Last edit by ${updatedBy} - ${formattedUpdatedAt}` : formattedUpdatedAt}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-800 px-3 py-2 text-xs font-bold text-white outline-none">
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="c">C</option>
          </select>
          <button
            onClick={runCode}
            className="rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400">
            Run
          </button>
          <button
            onClick={saveCode}
            className="rounded-2xl bg-blue-500 px-4 py-2 text-xs font-black text-white hover:bg-blue-400">
            Save code
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_12rem] lg:grid-cols-[1fr_24rem] lg:grid-rows-1">
        <div className="relative min-h-0">
          <textarea
            value={code}
            onChange={(e) => changeCode(e.target.value)}
            spellCheck="false"
            title={updatedBy ? `Last edit by ${updatedBy}` : 'Live code editor'}
            className="h-full min-h-0 w-full resize-none border-0 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none sm:p-6"
          />
          {updatedBy && (
            <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-200">
              {updatedBy}
            </div>
          )}
        </div>
        <aside className="min-h-0 overflow-y-auto border-t border-white/10 bg-slate-900 p-4 lg:border-l lg:border-t-0">
          <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Console</p>
          <pre className="whitespace-pre-wrap break-words rounded-2xl bg-black/30 p-4 text-xs leading-6 text-emerald-100">
            {output}
          </pre>
        </aside>
      </div>
    </div>
  );
}
