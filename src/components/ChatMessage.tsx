import React, { useState } from 'react';
import { Message } from '../types';
import { Brain, Globe, HelpCircle, Copy, Loader2, CheckCircle, ChevronRight, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import userAvatar from '../assets/avatar.png';
import botAvatar from '../assets/avatar_bot.png';

interface ChatMessageProps {
  message: Message;
  isLatest?: boolean;
  username?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, username = 'You' }) => {
  const isUser = message.role === 'user';
  const hasReasoning = !isUser && message.reasoning && message.reasoning.length > 0;
  const hasSteps = !isUser && message.steps && message.steps.length > 0;

  const webSearchCalls = message.toolCalls?.filter(tc => tc.name === 'web_search') || [];
  const clarifyCalls = message.toolCalls?.filter(tc => tc.name === 'clarify') || [];

  const [showReasoning, setShowReasoning] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);

  return (
    <div className={`flex gap-3 p-4 ${isUser ? 'bg-gray-50' : 'bg-white'}`}>
      <img 
        src={isUser ? userAvatar : botAvatar} 
        alt={isUser ? 'User' : 'Assistant'} 
        className="flex-shrink-0 w-8 h-8 rounded-full object-cover"
      />
      <div className="flex-1">
        <div className="font-medium text-sm mb-1">
          {isUser ? username : 'Assistant'}
        </div>

        {webSearchCalls.length > 0 && (
          <div className="mb-3 bg-blue-50 rounded-lg border border-blue-200">
            <button
              onClick={() => setShowWebSearch(!showWebSearch)}
              className="w-full p-3 flex items-center gap-1.5 text-xs text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
            >
              {showWebSearch ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Globe className="w-3.5 h-3.5" />
              <span className="font-medium">Web Search ({webSearchCalls.length})</span>
            </button>
            {showWebSearch && (
              <div className="px-3 pb-3 text-blue-700 text-sm">
                {webSearchCalls.map((tc, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-blue-500">🔍</span>
                    <span>Searching: <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">{tc.query}</code></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {clarifyCalls.length > 0 && (
          <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-2">
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="font-medium">需要澄清</span>
            </div>
            <div className="text-amber-700 text-sm">
              请回答下方问题以继续对话
            </div>
          </div>
        )}

        {hasSteps && (
          <div className="mb-3 bg-purple-50 rounded-lg border border-purple-200">
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="w-full p-3 flex items-center gap-1.5 text-xs text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
            >
              {showSteps ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Loader2 className="w-3.5 h-3.5" />
              <span className="font-medium">执行过程 ({message.steps!.length} 步)</span>
            </button>
            {showSteps && (
              <div className="px-3 pb-3 space-y-2">
                {message.steps!.map((step, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    {step.type === 'tool_call' && (
                      <Globe className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    )}
                    {step.type === 'tool_result' && (
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    )}
                    {step.type === 'reasoning' && (
                      <Brain className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                    )}
                    <span className={`${
                      step.type === 'tool_call' ? 'text-blue-700' :
                      step.type === 'tool_result' ? 'text-green-700' :
                      'text-gray-600'
                    }`}>
                      {step.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {hasReasoning && (
          <div className="mb-3 bg-gray-50 rounded-lg border border-gray-200">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="w-full p-3 flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {showReasoning ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Brain className="w-3.5 h-3.5" />
              <span className="font-medium">Reasoning</span>
            </button>
            {showReasoning && (
              <div className="px-3 pb-3 text-gray-500 text-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:text-gray-600">
                {message.reasoning!.map((item, index) => (
                  <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
                    {item}
                  </ReactMarkdown>
                ))}
              </div>
            )}
          </div>
        )}
        
        {isUser ? (
          <div className="text-gray-800 prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-gray-800 prose prose-sm max-w-none">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');
                  
                  if (match) {
                    return (
                      <div className="relative group my-4">
                        <div className="flex items-center justify-between bg-gray-800 text-gray-200 px-4 py-2 text-xs rounded-t-lg">
                          <span>{match[1]}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(codeString)}
                            className="flex items-center gap-1 hover:text-white transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>复制</span>
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderTopLeftRadius: 0,
                            borderTopRightRadius: 0,
                            borderBottomLeftRadius: '0.5rem',
                            borderBottomRightRadius: '0.5rem',
                          }}
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }
                  
                  return (
                    <code className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-sm" {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};
