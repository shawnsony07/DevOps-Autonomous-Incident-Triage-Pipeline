import React from 'react';
import './PatchViewer.css';

interface PatchData {
  file_path: string;
  original_code: string;
  fixed_code: string;
  explanation: string;
}

interface Props {
  patch: PatchData;
}

const PatchViewer: React.FC<Props> = ({ patch }) => {
  return (
    <div className="patch-viewer">
      <div className="patch-file-path">
        <span>File: </span>
        <code>{patch.file_path}</code>
      </div>
      
      <div className="patch-explanation">
        <p>{patch.explanation}</p>
      </div>

      <div className="diff-container">
        <div className="diff-pane diff-original">
          <div className="diff-header">Original</div>
          <pre><code>{patch.original_code}</code></pre>
        </div>
        <div className="diff-pane diff-fixed">
          <div className="diff-header">Fixed</div>
          <pre><code>{patch.fixed_code}</code></pre>
        </div>
      </div>
    </div>
  );
};

export default PatchViewer;
