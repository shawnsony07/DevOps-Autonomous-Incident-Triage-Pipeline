import { EventEmitter } from 'node:events';

// Create a global event emitter for the pipeline
export const pipelineEmitter = new EventEmitter();
