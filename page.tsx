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

  // 로컬 스토리지에서 API 키 불러오기
  useEffect(() => {
    const savedKey = localStorage.getItem('my_openai_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  // API 키 저장 핸들러
  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('my_openai_key', key);
  };

  // 1. 단어 추출 요청 (404 에러 방지 처리 포함)
  const startAIAnalysis = async () => {
    if (!apiKey.trim().startsWith('sk-')) {
      alert('올바른 OpenAI API 키(sk-로 시작)를 입력해주세요!');
      return;
    }
    if (!text.trim()) {
      alert('노트 내용을 입력해주세요!');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apiKey }),
      });
      
      // 404 에러 등 HTTP 에러 발생 시 잡아내기
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `서버 통신 오류 (상태 코드: ${res.status})`);
      }
      
      const data = await res.json();
      
      if (data && data.length > 0) {
        setWords(data);
      } else {
        alert('추출할 수 있는 단어가 없습니다. 텍스트를 확인해주세요.');
      }
    } catch (e: any) {
      alert(`오류 발생: ${e.message}\n(만약 404가 뜬다면 app/api/extract/route.ts 파일 위치를 다시 확인해주세요!)`);
    } finally {
      setLoading(false);
    }
  };

  // 2. 게임 채점 로직
  const handleCheck = () => {
    if (words.length === 0) return;
    const current = words[0];
    const target = isEnToKo ? current.ko : current.en;

    const cleanUser = answer.trim().replace(/\s/g, '').toLowerCase();
    const cleanTarget = target.trim().replace(/\s/g, '').toLowerCase();

    if (cleanTarget.includes(cleanUser) && cleanUser.length >= cleanTarget.length * 0.8) {
      alert('✨ 정답입니다! 다음 단어로 넘어갑니다.');
      setWords((prev) => prev.slice(1));
    } else {
      alert(`❌ 틀렸어요! 정답은 [ ${target} ] 입니다.`);
      setWords((prev) => {
        const failedWord = prev[0];
        return [...prev.slice(1), failedWord];
      });
    }
    setAnswer('');
  };

  // --- 화면 렌더링 ---

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
          <button onClick={() => setIsEnToKo(!isEnToKo)} className="mt-6 text-gray-400 text-sm underline">모드 전환하기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-gray-50 text-black pt-12">
      <div className="w-full max-w-2xl bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
        
        <div className="mb-6 p-4 bg-red-50 rounded-2xl border border-red-100">
          <label className="block text-sm font-bold text-red-600 mb-2">🔑 내 OpenAI API 키</label>
          <input 
            type="password" 
            className="w-full p-3 border border-red-200 rounded-xl outline-none focus:border-red-400 text-black bg-white"
            placeholder="sk- 로 시작하는 키 입력 (브라우저에 자동 저장됨)"
            value={apiKey}
            onChange={handleKeyChange}
          />
        </div>

        <h1 className="text-3xl font-black mb-2 text-gray-800 text-center">🚀 AI Word Master</h1>
        <p className="text-center text-gray-500 mb-6 font-medium">복사한 영어 노트를 아래에 붙여넣으세요.</p>
        
        <textarea 
          className="w-full h-80 p-5 border-2 border-gray-200 rounded-2xl mb-6 focus:border-blue-400 outline-none resize-none text-lg text-black bg-white"
          placeholder="예시:&#10;congested <- 붐비다&#10;astonishing rate -> 비율적으로 증가했을때..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        
        <button 
          onClick={startAIAnalysis}
          disabled={loading}
          className="w-full bg-blue-600 text-white p-5 rounded-2xl font-bold text-xl hover:bg-blue-700 disabled:bg-gray-300 transition-all flex justify-center items-center gap-2"
        >
          {loading ? "⏳ AI가 분석 중입니다..." : "✨ 단어장 생성 및 시작!"}
        </button>
      </div>
    </div>
  );
}
