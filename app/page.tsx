'use client';
import { useState, useEffect } from 'react';

interface Word {
  en: string;
  ko: string;
  pos: string;
  phonetics: string;
}

export default function AIWordMaster() {
  const [apiKey, setApiKey] = useState('');
  const [text, setText] = useState('');
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [isEnToKo, setIsEnToKo] = useState(true);

  useEffect(() => {
    const savedKey = localStorage.getItem('my_openai_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('my_openai_key', key);
  };

  const startAIAnalysis = async () => {
    if (!apiKey.trim().startsWith('sk-')) return alert('OpenAI API 키를 정확히 입력해주세요.');
    if (!text.trim()) return alert('학습할 텍스트를 입력해주세요.');
    
    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apiKey }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `네트워크 오류 (${res.status})`);
      }
      
      const data = await res.json();
      if (data && data.length > 0) setWords(data);
      else alert('추출할 수 있는 단어가 없습니다.');
    } catch (e: any) {
      alert(`오류 발생: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = () => {
    if (words.length === 0 || !answer.trim()) return;
    
    const current = words[0];
    const target = isEnToKo ? current.ko : current.en;

    const cleanUser = answer.trim().replace(/\s/g, '').toLowerCase();
    const cleanTarget = target.trim().replace(/\s/g, '').toLowerCase();

    if (cleanTarget.includes(cleanUser) && cleanUser.length >= cleanTarget.length * 0.8) {
      setWords((prev) => prev.slice(1));
    } else {
      setWords((prev) => {
        const failedWord = prev[0];
        return [...prev.slice(1), failedWord];
      });
    }
    setAnswer('');
  };

  if (words.length > 0) {
    const current = words[0];
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
        <div className="w-full max-w-md p-10 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <p className="text-xs font-medium tracking-widest text-gray-400 mb-8 uppercase">
            {isEnToKo ? "Translate to Korean" : "Type in English"}
          </p>
          
          <h2 className="text-4xl font-normal mb-3 text-gray-800 break-words text-center">
            {isEnToKo ? current.en : current.ko}
          </h2>
          
          <div className="flex items-center gap-2 mb-10 text-gray-400 font-light">
            <span className="text-sm">{current.phonetics}</span>
            <span className="text-[10px] uppercase border border-gray-200 px-2 py-0.5 rounded-full">{current.pos}</span>
          </div>
          
          <input 
            className="w-full p-4 border-b border-gray-200 bg-transparent mb-8 text-center text-xl font-light focus:border-gray-800 outline-none transition-colors"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            placeholder="답변을 입력하세요"
            autoFocus
            spellCheck="false"
          />
          
          <button 
            onClick={handleCheck} 
            className="w-full bg-gray-900 text-white py-4 rounded-xl font-light tracking-wider hover:bg-gray-800 transition-all active:scale-[0.98]"
          >
            확인
          </button>
          
          <button 
            onClick={() => setIsEnToKo(!isEnToKo)} 
            className="mt-6 text-gray-400 text-xs font-light hover:text-gray-600 transition-colors"
          >
            모드 전환
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-[#fafafa] pt-16">
      <div className="w-full max-w-2xl bg-white p-10 rounded-2xl shadow-sm border border-gray-100">
        
        <div className="mb-8">
          <label className="block text-xs font-medium tracking-widest text-gray-400 mb-3 uppercase">API Key</label>
          <input 
            type="password" 
            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-gray-300 text-gray-700 font-light text-sm"
            placeholder="sk-..."
            value={apiKey}
            onChange={handleKeyChange}
          />
        </div>

        <h1 className="text-2xl font-light mb-2 text-gray-800 tracking-tight">문장 분석기</h1>
        <p className="text-gray-400 mb-8 font-light text-sm">노트를 붙여넣으면 AI가 단어 낱말 카드를 생성합니다.</p>
        
        <textarea 
          className="w-full h-72 p-6 bg-gray-50 border border-gray-100 rounded-xl mb-8 focus:border-gray-300 outline-none resize-none text-gray-700 font-light leading-relaxed"
          placeholder="여기에 텍스트를 붙여넣으세요..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        
        <button 
          onClick={startAIAnalysis}
          disabled={loading}
          className="w-full bg-gray-900 text-white py-5 rounded-xl font-light tracking-wider hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-[0.99] flex justify-center items-center"
        >
          {loading ? "분석 진행 중..." : "단어장 생성 시작"}
        </button>
      </div>
    </div>
  );
}
