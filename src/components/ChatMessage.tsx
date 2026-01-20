import React from 'react';
import { Message } from '../types';
import { Bot, User, Brain, Globe } from 'lucide-react';
import { TypewriterText } from './TypewriterText';

interface ChatMessageProps {
  message: Message;
  isLatest?: boolean;
  username?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLatest = false, username = 'You' }) => {
  const isUser = message.role === 'user';
  const hasReasoning = !isUser && message.reasoning && message.reasoning.length > 0;
  const hasToolCalls = !isUser && message.toolCalls && message.toolCalls.length > 0;
  const shouldAnimate = isLatest && !isUser;

  return (
    <div className={`flex gap-3 p-4 ${isUser ? 'bg-gray-50' : 'bg-white'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-blue-500' : 'bg-green-500'
      }`}>
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm mb-1">
          {isUser ? username : 'Assistant'}
        </div>

        {hasToolCalls && (
          <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-2">
              <Globe className="w-3.5 h-3.5" />
              <span className="font-medium">Web Search</span>
            </div>
            <div className="text-blue-700 text-sm">
              {message.toolCalls!.map((tc, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-blue-500">🔍</span>
                  <span>Searching: <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">{tc.query}</code></span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {hasReasoning && (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
              <Brain className="w-3.5 h-3.5" />
              <span className="font-medium">Reasoning</span>
            </div>
            <div className="text-gray-500 text-sm whitespace-pre-wrap">
              {message.reasoning!.map((item, index) => (
                <p key={index} className="mb-1 last:mb-0">{item}</p>
              ))}
            </div>
          </div>
        )}
        
        <div className="text-gray-800">
          {shouldAnimate ? (
            <TypewriterText text={message.content} speed={10} />
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>
      </div>
    </div>
  );
};
