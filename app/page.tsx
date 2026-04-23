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

  // 컴포넌트가 켜질 때, 브라우저에 저장해둔 API 키가 있다면 불러옵니다.
  useEffect(() => {
    const savedKey = localStorage.getItem('my_openai_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  // API 키 입력 시 브라우저에 자동 저장하는 함수
  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('my_openai_key', key);
  };

  // 1. AI API 호출 로직 (텍스트와 함께 API 키도 보냅니다!)
  const startAIAnalysis = async () => {
    if (!apiKey.startsWith('sk-')) {
      alert('올바른 OpenAI API 키(sk-로 시작)를 입력해주세요!');
      return;
    }
    if (!text.trim()) {
      alert('텍스트를 입력해주세요!');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apiKey }), // 핵심: 키를 같이 전송!
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'API 오류');
      
      if (data && data.length > 0) {
        setWords(data);
      } else {
        alert('추출된 단어가 없습니다.');
      }
    } catch (e: any) {
      alert(e.message || '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 2. 정답 채점 및 큐 관리
  const handleCheck = () => {
    if (words.length === 0) return;
    const current = words[0];
    const target = isEnToKo ? current.ko : current.en;

    const cleanUser = answer.trim().replace(/\s/g, '').toLowerCase();
    const cleanTarget = target.trim().replace(/\s/g, '').toLowerCase();

    if (cleanTarget.includes(cleanUser) && cleanUser.length >= cleanTarget.length * 0.8) {
      alert('✨ 정답입니다!');
      setWords((prev) => prev.slice(1));
    } else {
      alert(`❌ 틀렸어요! 정답: ${target}`);
      setWords((prev) => {
        const failedWord = prev[0];
        return [...prev.slice(1), failedWord];
      });
    }
    setAnswer('');
  };

  // --- 화면 렌더링 ---

  // 게임 진행 화면
  if (words.length > 0) {
    const current = words[0];
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50 text-black">
        <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-xl text-center border border-gray-100">
          <div className="text-sm font-bold text-blue-500 mb-2">
            {isEnToKo ? "뜻 맞추기 (En → Ko)" : "영어 타이핑 (Ko → En)"}
          </div>
          <div className="text-4xl font-black mb-4 text-gray-800 break-words">
            {isEnToKo ? current.en : current.ko}
          </div>
          <div className="text-gray-400 mb-8 font-medium">
            {current.phonetics} <span className="text-xs bg-gray-100 px-2 py-1 rounded ml-1">{current.pos}</span>
          </div>
          <input 
            className="w-full p-4 border-2 border-gray-200 rounded-2xl mb-4 text-center text-xl focus:border-blue-400 outline-none transition-all"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            placeholder="정답을 입력하세요"
            autoFocus
          />
          <button onClick={handleCheck} className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all active:scale-95">확인</button>
          <button onClick={() => setIsEnToKo(!isEnToKo)} className="mt-6 text-gray-400 text-sm underline">학습 모드 전환</button>
        </div>
      </div>
    );
  }

  // 메인 텍스트 입력 화면
  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-gray-50 text-black pt-12">
      <div className="w-full max-w-2xl bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
        
        {/* API 키 입력 영역 */}
        <div className="mb-6 p-4 bg-red-50 rounded-2xl border border-red-100">
          <label className="block text-sm font-bold text-red-600 mb-2">🔑 내 OpenAI API 키 입력 (브라우저에만 안전하게 저장됩니다)</label>
          <input 
            type="password" 
            className="w-full p-3 border border-red-200 rounded-xl outline-none focus:border-red-400 text-black"
            placeholder="sk- 로 시작하는 키를 붙여넣으세요"
            value={apiKey}
            onChange={handleKeyChange}
          />
        </div>

        <h1 className="text-3xl font-black mb-2 text-gray-800 text-center">🚀 AI Word Master</h1>
        <p className="text-center text-gray-500 mb-6 font-medium">오늘 배운 내용을 아래에 통째로 붙여넣으세요!</p>
        
        <textarea 
          className="w-full h-80 p-5 border-2 border-gray-200 rounded-2xl mb-6 focus:border-blue-400 outline-none resize-none text-lg text-black"
          placeholder="여기에 복사한 텍스트를 붙여넣으세요..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        
        <button 
          onClick={startAIAnalysis}
          disabled={loading}
          className="w-full bg-blue-600 text-white p-5 rounded-2xl font-bold text-xl hover:bg-blue-700 disabled:bg-gray-300 transition-all flex justify-center items-center gap-2"
        >
          {loading ? "⏳ AI가 분석 중..." : "✨ 단어장 생성 및 시작!"}
        </button>
      </div>
    </div>
  );
}
