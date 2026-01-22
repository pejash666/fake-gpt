import React, { useState, useEffect } from 'react';
import { Message } from '../types';
import { Brain, Globe, HelpCircle, Copy, Loader2, CheckCircle, ChevronRight, ChevronDown, Link, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import userAvatar from '../assets/avatar.png';
import botAvatar from '../assets/avatar_bot.png';

interface ChatMessageProps {
  message: Message;
  isLatest?: boolean;
  isLoading?: boolean;
  username?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLatest, isLoading, username = 'You' }) => {
  const isUser = message.role === 'user';
  const hasReasoning = !isUser && message.reasoning && message.reasoning.length > 0 && message.reasoning.some(r => r.trim());
  const hasContent = !isUser && message.content && message.content.trim();
  
  const isStreaming = isLatest && !isUser && isLoading;
  const isReasoningPhase = isStreaming && !hasContent;
  const isContentStreaming = isStreaming && hasContent;
  
  const [showReasoning, setShowReasoning] = useState(isReasoningPhase);
  
  useEffect(() => {
    if (isLatest && hasContent && showReasoning) {
      setShowReasoning(false);
    }
    if (isLatest && !hasContent && hasReasoning) {
      setShowReasoning(true);
    }
  }, [isLatest, hasContent, hasReasoning]);

  const toolCallsFromDone = message.toolCalls?.filter(tc => tc.name === 'web_search' || tc.name === 'web_fetch') || [];
  const clarifyCalls = message.toolCalls?.filter(tc => tc.name === 'clarify') || [];
  
  const toolCallSteps = message.steps?.filter(s => s.type === 'tool_call') || [];
  const toolResultSteps = message.steps?.filter(s => s.type === 'tool_result') || [];
  
  const toolCallCount = toolCallsFromDone.length > 0 ? toolCallsFromDone.length : toolCallSteps.length;
  const completedCount = toolResultSteps.length;
  
  const hasToolActivity = toolCallCount > 0 || (message.steps && message.steps.length > 0);
  const isToolsComplete = hasToolActivity && hasContent && (toolCallsFromDone.length > 0);

  const [showTools, setShowTools] = useState(false);

  return (
    <div className={`flex gap-3 p-4 ${isUser ? 'bg-gray-50' : 'bg-white'}`}>
      <img 
        src={isUser ? userAvatar : botAvatar} 
        alt={isUser ? 'User' : 'Assistant'} 
        className="flex-shrink-0 w-8 h-8 rounded-full object-cover"
      />
      <div className="flex-1">
        <div className="font-medium text-sm mb-1 flex items-center gap-2">
          {isUser ? username : 'Assistant'}
          {isStreaming && !isUser && (
            <span className="flex items-center gap-1 text-xs text-blue-500 font-normal">
              <Loader2 className="w-3 h-3 animate-spin" />
              生成中...
            </span>
          )}
        </div>

        {hasReasoning && (
          <div className="mb-3 bg-gray-50 rounded-lg border border-gray-200">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="w-full p-3 flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {showReasoning ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Brain className="w-3.5 h-3.5" />
              <span className="font-medium">思考过程</span>
              {isReasoningPhase && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
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

        {hasToolActivity && (
          <div className="mb-3 bg-blue-50 rounded-lg border border-blue-200">
            <button
              onClick={() => setShowTools(!showTools)}
              className="w-full p-3 flex items-center gap-1.5 text-xs text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
            >
              {showTools ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {isToolsComplete ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              <Wrench className="w-3.5 h-3.5" />
              <span className="font-medium">
                工具调用 {toolCallCount > 0 && `(${completedCount}/${toolCallCount})`}
              </span>
              {isToolsComplete && (
                <span className="ml-auto text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  完成
                </span>
              )}
            </button>
            {showTools && (
              <div className="px-3 pb-3 space-y-2">
                {toolCallsFromDone.map((tc, index) => (
                  <div key={`tool-${index}`} className="flex items-center gap-2 text-sm">
                    {tc.name === 'web_search' ? (
                      <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <Link className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                    <span className={tc.name === 'web_search' ? 'text-blue-700' : 'text-green-700'}>
                      {tc.name === 'web_search' ? '搜索' : '获取'}: 
                      <code className={`${tc.name === 'web_search' ? 'bg-blue-100' : 'bg-green-100'} px-1.5 py-0.5 rounded text-xs ml-1 break-all`}>
                        {tc.query}
                      </code>
                    </span>
                    {isToolsComplete && <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />}
                  </div>
                ))}
                {message.steps && message.steps.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
                    <div className="text-xs text-blue-500 font-medium mb-1">执行日志</div>
                    {message.steps.map((step, index) => (
                      <div key={index} className="flex items-start gap-2 text-xs text-gray-600">
                        {step.type === 'tool_result' ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          </div>
                        )}
                        <span>{step.content}</span>
                      </div>
                    ))}
                  </div>
                )}
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
        
        {isUser ? (
          <div className="text-gray-800">
            {message.images && message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {message.images.map(img => (
                  <img 
                    key={img.id}
                    src={`data:${img.mimeType};base64,${img.base64}`}
                    alt="User uploaded"
                    className="max-h-64 max-w-full rounded-lg border border-gray-200 object-contain"
                  />
                ))}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
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
            {isContentStreaming && (
              <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
