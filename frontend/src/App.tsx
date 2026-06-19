import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, ShieldAlert, GitMerge, CheckCircle, Activity, Loader2 } from 'lucide-react';
import PipelineVisualizer from './components/PipelineVisualizer';
import LiveConsole from './components/LiveConsole';
import PatchViewer from './components/PatchViewer';
import './App.css';

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'error' | 'success' | 'system';
  message: string;
}

export interface AgentState {
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  elapsed?: string;
  result?: any;
  error?: string;
}

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [issue, setIssue] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agents, setAgents] = useState<AgentState[]>([
    { name: 'Agent 1 — Log Parser', status: 'idle' },
    { name: 'Agent 2 — RAG Retriever', status: 'idle' },
    { name: 'Agent 3 — Code Repair (LLM)', status: 'idle' },
    { name: 'Agent 4 — Git Bridge', status: 'idle' }
  ]);
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [patchData, setPatchData] = useState<any>(null);
  const [parsedLog, setParsedLog] = useState<any>(null);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substring(7), timestamp: new Date().toISOString(), type, message }]);
  };

  useEffect(() => {
    // Connect to SSE endpoint on the backend
    const eventSource = new EventSource('http://localhost:3000/api/stream');

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    eventSource.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        
        if (type === 'connected') {
          addLog('system', data.message);
        } else if (type === 'pipeline:start') {
          setPipelineStatus('running');
          setIssue(data.issuePayload);
          setAgents(prev => prev.map(a => ({ ...a, status: 'idle', elapsed: undefined, result: undefined, error: undefined })));
          setLogs([]);
          setPatchData(null);
          setParsedLog(null);
          addLog('info', `Pipeline started for Issue #${data.issuePayload.issueNumber}`);
        } else if (type === 'agent:start') {
          setAgents(prev => prev.map(a => a.name === data.agentName ? { ...a, status: 'running' } : a));
          addLog('info', `Started ${data.agentName}...`);
        } else if (type === 'agent:complete') {
          setAgents(prev => prev.map(a => a.name === data.agentName ? { ...a, status: 'completed', elapsed: data.elapsed, result: data.result } : a));
          addLog('success', `${data.agentName} completed in ${data.elapsed}ms`);
          
          if (data.agentName === 'Agent 1 — Log Parser' && data.result) {
            setParsedLog(data.result);
          }
          if (data.agentName === 'Agent 3 — Code Repair (LLM)' && data.result) {
            setPatchData(data.result);
          }
        } else if (type === 'agent:error') {
          setAgents(prev => prev.map(a => a.name === data.agentName ? { ...a, status: 'error', elapsed: data.elapsed, error: data.error } : a));
          addLog('error', `${data.agentName} failed: ${data.error}`);
        } else if (type === 'pipeline:complete') {
          setPipelineStatus('completed');
          addLog('success', `Pipeline completed successfully.`);
        } else if (type === 'pipeline:error') {
          setPipelineStatus('error');
          addLog('error', `Pipeline failed: ${data.error}`);
        }
      } catch (err) {
        console.error('Error parsing SSE data', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="app-container">
      <header className="top-bar">
        <div className="logo-area">
          <Activity className="icon-pulse" color={isConnected ? 'var(--accent-cyan)' : 'var(--text-secondary)'} />
          <h1>Autonomous Incident Triage</h1>
        </div>
        <div className="status-badge">
          {isConnected ? (
             <span className="badge-connected">● Connected</span>
          ) : (
             <span className="badge-disconnected">● Disconnected</span>
          )}
        </div>
      </header>

      <main className="main-layout">
        <section className="left-panel">
          <div className="panel-header">
            <ShieldAlert size={18} />
            <h2>Active Incident</h2>
          </div>
          <div className="panel-content">
            {issue ? (
              <div className="issue-card">
                <div className="issue-number">#{issue.issueNumber}</div>
                <h3 className="issue-title">{issue.issueTitle}</h3>
                <p className="repo-name">{issue.repoOwner}/{issue.repoName}</p>
                {parsedLog?.severity && (
                  <div className={`severity-badge severity-${parsedLog.severity.toLowerCase()}`}>
                    {parsedLog.severity} SEVERITY
                  </div>
                )}
                <div className="pipeline-status-indicator">
                  {pipelineStatus === 'running' && <><Loader2 className="spin" size={14} /> Processing...</>}
                  {pipelineStatus === 'completed' && <><CheckCircle color="var(--accent-green)" size={14} /> Resolved</>}
                  {pipelineStatus === 'error' && <><ShieldAlert color="var(--accent-red)" size={14} /> Failed</>}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>Waiting for webhooks...</p>
                <span className="empty-sub">Open an issue on GitHub to trigger the pipeline.</span>
              </div>
            )}

            <div className="visualizer-wrapper">
               <PipelineVisualizer agents={agents} pipelineStatus={pipelineStatus} />
            </div>
          </div>
        </section>

        <section className="right-panel">
          <div className="logs-container">
            <LiveConsole logs={logs} />
          </div>
          
          <AnimatePresence>
            {patchData && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="patch-container"
              >
                <div className="panel-header">
                  <GitMerge size={18} />
                  <h2>AI Generated Patch</h2>
                </div>
                <PatchViewer patch={patchData} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}

export default App;
