import React from 'react';
import { motion } from 'framer-motion';
import { Check, Circle, Loader2, XCircle } from 'lucide-react';
import type { AgentState } from '../App';
import './PipelineVisualizer.css';

interface Props {
  agents: AgentState[];
  pipelineStatus: 'idle' | 'running' | 'completed' | 'error';
}

const PipelineVisualizer: React.FC<Props> = ({ agents, pipelineStatus }) => {
  return (
    <div className="pipeline-visualizer">
      <div className="pipeline-track">
        {agents.map((agent, index) => {
          const isLast = index === agents.length - 1;
          
          return (
            <div key={agent.name} className="agent-node-container">
              <div className={`agent-node status-${agent.status}`}>
                <div className="node-icon">
                  {agent.status === 'idle' && <Circle size={16} color="var(--text-secondary)" />}
                  {agent.status === 'running' && <Loader2 className="spin" size={16} color="var(--accent-cyan)" />}
                  {agent.status === 'completed' && <Check size={16} color="var(--accent-green)" />}
                  {agent.status === 'error' && <XCircle size={16} color="var(--accent-red)" />}
                </div>
                
                <div className="node-info">
                  <div className="node-name">{agent.name}</div>
                  <div className="node-meta">
                    {agent.status === 'running' && <span className="meta-running">Processing...</span>}
                    {agent.status === 'completed' && <span className="meta-completed">{agent.elapsed}</span>}
                    {agent.status === 'error' && <span className="meta-error">Failed</span>}
                    {agent.status === 'idle' && <span className="meta-idle">Waiting</span>}
                  </div>
                </div>
              </div>
              
              {!isLast && (
                <div className={`connector status-${agent.status}`}>
                  <motion.div 
                    className="connector-fill"
                    initial={{ height: 0 }}
                    animate={{ height: agent.status === 'completed' ? '100%' : '0%' }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineVisualizer;
