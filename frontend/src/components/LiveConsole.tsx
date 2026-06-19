import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import type { LogEntry } from '../App';
import './LiveConsole.css';

interface Props {
  logs: LogEntry[];
}

const LiveConsole: React.FC<Props> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="live-console">
      <div className="console-header">
        <Terminal size={16} />
        <span>Live Terminal Output</span>
      </div>
      <div className="console-body">
        {logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false });
          return (
            <div key={log.id} className={`log-entry log-${log.type}`}>
              <span className="log-time">[{time}]</span>
              <span className="log-message">{log.message}</span>
            </div>
          );
        })}
        {logs.length === 0 && (
          <div className="log-entry log-system">
            <span className="log-message">Waiting for pipeline events...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LiveConsole;
