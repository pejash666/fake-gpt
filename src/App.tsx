import { useState, useEffect, useRef } from 'react';
import { Message, ModelConfig, ClarifyQuestion, ClarifyAnswer, PendingContext, Conversation, MessageImage } from './types';
import { NetlifyAPI } from './api';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { ModelSelector } from './components/ModelSelector';
import { UserSettings } from './components/UserSettings';
import { ClarifyForm } from './components/ClarifyForm';
import { MessageSquare, User, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import logo from './assets/logo.png';
import nameLogo from './assets/Name.png';

const STORAGE_KEY = 'fakegpt_conversations';

function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((c: Conversation) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt),
          messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
      } catch { return []; }
    }
    return [];
  });
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [api] = useState(() => new NetlifyAPI());
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    model: 'gpt-5.1',
    reasoning: { effort: 'medium' }
  });
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('username') || 'You';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingClarify, setPendingClarify] = useState<{
    questions: ClarifyQuestion[];
    context: PendingContext;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save conversations to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  // Update current conversation messages when messages change
  useEffect(() => {
    if (currentConversationId && messages.length > 0) {
      setConversations(prev => prev.map(conv => 
        conv.id === currentConversationId
          ? { ...conv, messages, updatedAt: new Date() }
          : conv
      ));
    }
  }, [messages, currentConversationId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const generateTitleAsync = async (conversationId: string, content: string) => {
    console.log('generateTitleAsync called:', conversationId, content);
    try {
      const title = await api.generateTitle(content);
      console.log('Generated title:', title);
      setConversations(prev => prev.map(conv =>
        conv.id === conversationId ? { ...conv, title, titleLoading: false } : conv
      ));
    } catch (error) {
      console.error('Failed to generate title:', error);
      setConversations(prev => prev.map(conv =>
        conv.id === conversationId ? { ...conv, title: content.slice(0, 20), titleLoading: false } : conv
      ));
    }
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setPendingClarify(null);
  };

  const handleSelectConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setCurrentConversationId(id);
      setMessages(conv.messages);
      setPendingClarify(null);
    }
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) {
      setCurrentConversationId(null);
      setMessages([]);
    }
  };

  const handleSendMessage = async (content: string, images?: MessageImage[]) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      images,
      timestamp: new Date(),
    };

    // Create new conversation if none exists
    if (!currentConversationId) {
      const newConvId = Date.now().toString();
      const newConv: Conversation = {
        id: newConvId,
        title: '',
        titleLoading: true,
        messages: [userMessage],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setConversations(prev => [newConv, ...prev]);
      setCurrentConversationId(newConv.id);
      generateTitleAsync(newConvId, content);
    }

    // Create empty assistant message for streaming
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: [],
      toolCalls: [],
      steps: [],
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    try {
      await api.sendMessageStream([...messages, userMessage], modelConfig, (event) => {
        switch (event.type) {
          case 'reasoning_delta':
            setMessages(prev => prev.map(msg => {
              if (msg.id !== assistantMsgId) return msg;
              const currentReasoning = msg.reasoning || [''];
              const lastIndex = currentReasoning.length - 1;
              const updated = [...currentReasoning];
              updated[lastIndex] = (updated[lastIndex] || '') + (event.delta || '');
              return { ...msg, reasoning: updated };
            }));
            break;

          case 'content_delta':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId 
                ? { ...msg, content: (msg.content || '') + (event.delta || '') }
                : msg
            ));
            break;

          case 'tool_call':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { 
                    ...msg, 
                    steps: [...(msg.steps || []), { 
                      type: 'tool_call' as const, 
                      content: event.name === 'web_search' 
                        ? `🔍 正在搜索: ${event.query}`
                        : `🌐 正在获取: ${event.query}`,
                      timestamp: Date.now()
                    }]
                  }
                : msg
            ));
            break;

          case 'tool_result':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { 
                    ...msg, 
                    steps: [...(msg.steps || []), { 
                      type: 'tool_result' as const, 
                      content: event.name === 'web_search'
                        ? `✅ 搜索完成，获取到 ${event.resultCount} 条结果`
                        : `✅ 页面获取完成，内容长度: ${event.resultCount}`,
                      timestamp: Date.now()
                    }],
                    reasoning: [...(msg.reasoning || []), '']
                  }
                : msg
            ));
            break;
            
          case 'done':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { ...msg, toolCalls: event.toolCalls }
                : msg
            ));
            break;
            
          case 'clarify':
            setPendingClarify({
              questions: event.questions!,
              context: event.pendingContext!
            });
            break;
            
          case 'error':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { ...msg, content: `Error: ${event.message}` }
                : msg
            ));
            break;
        }
      });
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMsgId
          ? { ...msg, content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}` }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleSaveUsername = (newUsername: string) => {
    setUsername(newUsername);
    localStorage.setItem('username', newUsername);
  };

  const handleClarifySubmit = async (answers: ClarifyAnswer[]) => {
    if (!pendingClarify) return;

    // Format user answers as a message
    const answersText = answers.map(a => {
      const question = pendingClarify.questions.find(q => q.id === a.questionId);
      const answerStr = Array.isArray(a.answer) ? a.answer.join(', ') : a.answer;
      return `**Q: ${question?.question || a.questionId}**\n\nA: ${answerStr}`;
    }).join('\n\n---\n\n');

    // Add user's answers as a message
    const userAnswerMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: answersText,
      timestamp: new Date(),
    };

    // Create empty assistant message for streaming
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: [],
      toolCalls: [],
      steps: [],
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userAnswerMessage, assistantMessage]);
    setIsLoading(true);
    setPendingClarify(null);

    try {
      await api.continueWithAnswersStream(pendingClarify.context, answers, (event) => {
        switch (event.type) {
          case 'reasoning_delta':
            setMessages(prev => prev.map(msg => {
              if (msg.id !== assistantMsgId) return msg;
              const currentReasoning = msg.reasoning || [''];
              const lastIndex = currentReasoning.length - 1;
              const updated = [...currentReasoning];
              updated[lastIndex] = (updated[lastIndex] || '') + (event.delta || '');
              return { ...msg, reasoning: updated };
            }));
            break;

          case 'content_delta':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId 
                ? { ...msg, content: (msg.content || '') + (event.delta || '') }
                : msg
            ));
            break;

          case 'tool_call':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { 
                    ...msg, 
                    steps: [...(msg.steps || []), { 
                      type: 'tool_call' as const, 
                      content: event.name === 'web_search' 
                        ? `🔍 正在搜索: ${event.query}`
                        : `🌐 正在获取: ${event.query}`,
                      timestamp: Date.now()
                    }]
                  }
                : msg
            ));
            break;

          case 'tool_result':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { 
                    ...msg, 
                    steps: [...(msg.steps || []), { 
                      type: 'tool_result' as const, 
                      content: event.name === 'web_search'
                        ? `✅ 搜索完成，获取到 ${event.resultCount} 条结果`
                        : `✅ 页面获取完成，内容长度: ${event.resultCount}`,
                      timestamp: Date.now()
                    }],
                    reasoning: [...(msg.reasoning || []), '']
                  }
                : msg
            ));
            break;
            
          case 'done':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { ...msg, toolCalls: event.toolCalls }
                : msg
            ));
            break;
            
          case 'clarify':
            setPendingClarify({
              questions: event.questions!,
              context: event.pendingContext!
            });
            break;
            
          case 'error':
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { ...msg, content: `Error: ${event.message}` }
                : msg
            ));
            break;
        }
      });
    } catch (error) {
      console.error('Error continuing after clarification:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMsgId
          ? { ...msg, content: `Error: ${error instanceof Error ? error.message : 'Failed to continue'}` }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      {isSidebarOpen && (
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              >
                {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
              </button>
              <img src={logo} alt="Logo" className="h-8 w-auto" />
              <img src={nameLogo} alt="Fake GPT" className="h-6 w-auto" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearChat}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
              >
                Clear Chat
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
              >
                <User className="w-4 h-4" />
                {username}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <div className="h-full bg-white">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">Welcome to Fake GPT</p>
                  <p className="text-sm mt-2">
                    Start a conversation below
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                  {messages.map((message, index) => (
                    <ChatMessage 
                      key={message.id} 
                      message={message} 
                      isLatest={index === messages.length - 1}
                      isLoading={isLoading}
                      username={username}
                    />
                  ))}
                  {pendingClarify && !isLoading && (
                    <div className="px-4">
                      <ClarifyForm
                        questions={pendingClarify.questions}
                        onSubmit={handleClarifySubmit}
                        isLoading={isLoading}
                      />
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>
        </main>

        <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />

        <ModelSelector 
          config={modelConfig} 
          onConfigChange={setModelConfig} 
        />

        <UserSettings
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          username={username}
          onSave={handleSaveUsername}
        />
      </div>
    </div>
  );
}

export default App;
