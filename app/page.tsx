'use client';
import { useState } from 'react';

interface Word {
  en: string;
  ko: string;
  pos: string;
  phonetics: string;
}

export default function WordMasterApp() {
  const [text, setText] = useState('');
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [isEnToKo, setIsEnToKo] = useState(true);

  // AI 단어 추출 실행
  const startAIAnalysis = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setWords(data);
    } catch (e) {
      alert('분석 중 오류가 발생했습니다.');
    }
    setLoading(false);
  };

  // 듀오링고식 채점 및 큐 관리
  const handleCheck = () => {
    const current = words[0];
    const target = isEnToKo ? current.ko : current.en;

    // 유사도 체크 (공백 제거 후 비교, 90% 정도 일치 여부)
    const cleanUser = answer.trim().replace(/\s/g, '');
    const cleanTarget = target.trim().replace(/\s/g, '');

    if (cleanTarget.includes(cleanUser) && cleanUser.length >= cleanTarget.length * 0.8) {
      alert('✨ 정답입니다! (일주일 뒤 복습)');
      setWords(words.slice(1)); // 정답이면 리스트에서 제거
    } else {
      alert(`❌ 틀렸어요! 다시 연습합시다. 정답: ${target}`);
      // 오답이면 맨 뒤로 보내서 다시 나오게 함 (SRS 방식)
      const nextQueue = [...words.slice(1), words[0]];
      setWords(nextQueue);
    }
    setAnswer('');
  };

  if (words.length > 0) {
    const current = words[0];
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50">
        <div className="w-full max-w-sm p-8 bg-white rounded-3xl shadow-2xl text-center">
          <div className="text-sm font-bold text-blue-500 mb-2">{isEnToKo ? "English to Korean" : "Korean to English"}</div>
          <div className="text-5xl font-black mb-4 text-slate-800">
            {isEnToKo ? current.en : current.ko}
          </div>
          <div className="text-slate-400 mb-8">{current.phonetics} | {current.pos}</div>
          
          <input 
            className="w-full p-4 border-2 border-slate-200 rounded-2xl mb-4 text-center text-xl focus:border-blue-400 outline-none transition-all"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            placeholder="정답을 입력하세요"
            autoFocus
          />
          
          <button onClick={handleCheck} className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg">확인</button>
          <button onClick={() => setIsEnToKo(!isEnToKo)} className="mt-4 text-slate-400 text-sm underline">모드 변경</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-10 max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-6 text-slate-800">🧠 AI Word Master</h1>
      <textarea 
        className="w-full h-80 p-6 border-2 border-slate-200 rounded-3xl mb-6 focus:border-blue-400 outline-none shadow-inner"
        placeholder="오늘 공부한 내용을 붙여넣으세요..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button 
        onClick={startAIAnalysis}
        disabled={loading}
        className="w-full bg-blue-600 text-white p-5 rounded-2xl font-bold text-xl hover:bg-blue-700 disabled:bg-slate-300 transition-all shadow-xl"
      >
        {loading ? "AI 분석 중..." : "단어장 생성 및 시작"}
      </button>
    </div>
  );
}
