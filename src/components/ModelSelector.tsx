import React from 'react';
import { Brain, Zap } from 'lucide-react';
import { AVAILABLE_MODELS, REASONING_LEVELS, ModelConfig } from '../types';

interface ModelSelectorProps {
  config: ModelConfig;
  onConfigChange: (config: ModelConfig) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ config, onConfigChange }) => {
  const selectedModel = AVAILABLE_MODELS.find(m => m.id === config.model);
  
  return (
    <div className="flex items-center gap-4 p-3 bg-gray-50 border-b">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-orange-500" />
        <span className="text-sm font-medium text-gray-700">Model:</span>
      </div>
      
      <div className="flex items-center gap-1">
        <select
          value={config.model}
          onChange={(e) => onConfigChange({ ...config, model: e.target.value })}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          {AVAILABLE_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        {selectedModel?.fast && (
          <span className="flex items-center gap-0.5 text-yellow-500" title="Fast Response">
            <Zap className="w-4 h-4 fill-current" />
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Thinking:</span>
      </div>

      <select
        value={config.reasoning.effort}
        onChange={(e) => onConfigChange({ 
          ...config, 
          reasoning: { ...config.reasoning, effort: e.target.value as 'low' | 'medium' | 'high' }
        })}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
      >
        {REASONING_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </select>
    </div>
  );
};
