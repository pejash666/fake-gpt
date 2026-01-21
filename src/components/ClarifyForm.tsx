import React, { useState } from 'react';
import { ClarifyQuestion, ClarifyAnswer } from '../types';
import { HelpCircle, Send } from 'lucide-react';

interface ClarifyFormProps {
  questions: ClarifyQuestion[];
  onSubmit: (answers: ClarifyAnswer[]) => void;
  isLoading?: boolean;
}

export const ClarifyForm: React.FC<ClarifyFormProps> = ({ questions, onSubmit, isLoading = false }) => {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const handleSingleChoice = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleMultipleChoice = (questionId: string, value: string, checked: boolean) => {
    setAnswers(prev => {
      const current = (prev[questionId] as string[]) || [];
      if (checked) {
        return { ...prev, [questionId]: [...current, value] };
      } else {
        return { ...prev, [questionId]: current.filter(v => v !== value) };
      }
    });
  };

  const handleTextInput = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    const formattedAnswers: ClarifyAnswer[] = questions.map(q => ({
      questionId: q.id,
      answer: answers[q.id] || (q.type === 'multiple_choice' ? [] : '')
    }));
    onSubmit(formattedAnswers);
  };

  const isValid = questions.every(q => {
    if (!q.required) return true;
    const answer = answers[q.id];
    if (!answer) return false;
    if (Array.isArray(answer)) return answer.length > 0;
    return answer.trim().length > 0;
  });

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-3">
      <div className="flex items-center gap-2 text-amber-700 mb-4">
        <HelpCircle className="w-5 h-5" />
        <span className="font-medium">需要更多信息</span>
      </div>

      <div className="space-y-4">
        {questions.map((q, index) => (
          <div key={q.id} className="bg-white rounded-lg p-3 border border-amber-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {index + 1}. {q.question}
              {q.required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {q.type === 'single_choice' && q.options && (
              <div className="space-y-2">
                {q.options.map(option => (
                  <label key={option} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={q.id}
                      value={option}
                      checked={answers[q.id] === option}
                      onChange={() => handleSingleChoice(q.id, option)}
                      className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                      disabled={isLoading}
                    />
                    <span className="text-sm text-gray-600">{option}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'multiple_choice' && q.options && (
              <div className="space-y-2">
                {q.options.map(option => (
                  <label key={option} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      value={option}
                      checked={(answers[q.id] as string[] || []).includes(option)}
                      onChange={(e) => handleMultipleChoice(q.id, option, e.target.checked)}
                      className="w-4 h-4 text-amber-600 focus:ring-amber-500 rounded"
                      disabled={isLoading}
                    />
                    <span className="text-sm text-gray-600">{option}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'text' && (
              <textarea
                value={(answers[q.id] as string) || ''}
                onChange={(e) => handleTextInput(q.id, e.target.value)}
                placeholder="请输入您的回答..."
                className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                rows={2}
                disabled={isLoading}
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!isValid || isLoading}
        className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Send className="w-4 h-4" />
        <span>{isLoading ? '提交中...' : '提交回答'}</span>
      </button>
    </div>
  );
};
