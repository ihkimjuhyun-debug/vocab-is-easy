'use client';
import { useState } from 'react';

interface Word {
  en: string;
  ko: string;
  pos: string;
  phonetics: string;
}

export default function AIWordMaster() {
  const [text, setText] = useState('');
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [isEnToKo, setIsEnToKo] = useState(true);
  
  // 복구된 기능: 관리자 모드 상태 및 수동 단어 추가
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [newWord, setNewWord] = useState({ en: '', ko: '', pos: 'Noun', phonetics: '' });

  // 1. 단어 분석 로직
  const startAIAnalysis = async () => {
    if (!text.trim()) return alert('노트 내용을 입력해주세요!');
    
    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      if (!res.ok) throw new Error('서버 통신 오류');
      
      const data = await res.json();
      if (data && data.length > 0) {
        setWords((prev) => [...prev, ...data]); // 기존 큐에 단어 누적
        setText('');
      } else {
        alert('추출할 수 있는 단어가 없습니다.');
      }
    } catch (e) {
      alert('분석 중 오류가 발생했습니다. Vercel 환경 변수(OPENAI_API_KEY) 설정을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  // 2. 관리자 단어 수동 추가 로직
  const handleAddWord = () => {
    if (!newWord.en || !newWord.ko) return alert('영어와 한국어 뜻은 필수입니다.');
    setWords((prev) => [...prev, newWord]);
    setNewWord({ en: '', ko: '', pos: 'Noun', phonetics: '' });
    alert('단어가 수동으로 추가되었습니다.');
  };

  // 3. 게임 채점 로직 (타이머 제거, 오직 득점/오답 큐 이동)
  const handleCheck = () => {
    if (words.length === 0 || !answer.trim()) return;
    
    const current = words[0];
    const target = isEnToKo ? current.ko : current.en;

    const cleanUser = answer.trim().replace(/\s/g, '').toLowerCase();
    const cleanTarget = target.trim().replace(/\s/g, '').toLowerCase();

    if (cleanTarget.includes(cleanUser) && cleanUser.length >= cleanTarget.length * 0.8) {
      // 정답 시 큐에서 제거
      setWords((prev) => prev.slice(1));
    } else {
      alert(`❌ 오답입니다. 정답은 [ ${target} ] 입니다.\n해당 단어는 큐의 맨 뒤로 이동하여 다시 출제됩니다.`);
      // 오답 시 큐 맨 뒤로 이동
      setWords((prev) => {
        const failedWord = prev[0];
        return [...prev.slice(1), failedWord];
      });
    }
    setAnswer('');
  };

  // --- 화면 렌더링 영역 ---

  // 게임 진행 화면 (단어가 있고, 관리자 모드가 아닐 때)
  if (words.length > 0 && !isAdminMode) {
    const current = words[0];
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fafafa]">
        <div className="w-full max-w-md p-10 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center relative">
          
          <button 
            onClick={() => setIsAdminMode(true)}
            className="absolute top-4 right-4 text-[10px] text-gray-300 hover:text-gray-500 uppercase tracking-widest transition-colors"
          >
            Admin
          </button>

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

          <p className="mt-8 text-[11px] text-gray-300 font-light">남은 단어: {words.length}개</p>
        </div>
      </div>
    );
  }

  // 메인 입력 화면 & 관리자 화면
  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-[#fafafa] pt-16">
      <div className="w-full max-w-2xl bg-white p-10 rounded-2xl shadow-sm border border-gray-100 relative">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-light text-gray-800 tracking-tight">AI Word Master</h1>
            <p className="text-gray-400 mt-1 font-light text-sm">노트를 붙여넣어 단어 낱말 카드를 생성하세요.</p>
          </div>
          <button 
            onClick={() => setIsAdminMode(!isAdminMode)}
            className={`text-xs px-4 py-2 border rounded-full transition-colors font-light tracking-wide ${isAdminMode ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-400 border-gray-200 hover:text-gray-600'}`}
          >
            {isAdminMode ? '게임으로 돌아가기' : '관리자 모드'}
          </button>
        </div>

        {isAdminMode && (
          <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-4 tracking-wide">수동 단어 추가 (관리자 전용)</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input placeholder="영어 (필수)" value={newWord.en} onChange={e => setNewWord({...newWord, en: e.target.value})} className="p-3 rounded-lg border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="한국어 뜻 (필수)" value={newWord.ko} onChange={e => setNewWord({...newWord, ko: e.target.value})} className="p-3 rounded-lg border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="품사 (예: Noun)" value={newWord.pos} onChange={e => setNewWord({...newWord, pos: e.target.value})} className="p-3 rounded-lg border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
              <input placeholder="발음 기호" value={newWord.phonetics} onChange={e => setNewWord({...newWord, phonetics: e.target.value})} className="p-3 rounded-lg border border-gray-200 bg-white text-sm font-light outline-none focus:border-gray-400" />
            </div>
            <button onClick={handleAddWord} className="w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-light tracking-wide hover:bg-blue-700 transition-colors">리스트에 추가하기</button>
          </div>
        )}
        
        <textarea 
          className="w-full h-64 p-6 bg-gray-50 border border-gray-100 rounded-xl mb-6 focus:border-gray-300 outline-none resize-none text-gray-700 font-light leading-relaxed"
          placeholder="여기에 복사한 문장이나 단어들을 붙여넣으세요..."
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

        {words.length > 0 && !isAdminMode && (
          <button onClick={() => setWords([])} className="w-full mt-4 text-red-500 py-3 text-sm font-light hover:bg-red-50 rounded-xl transition-colors">
            진행 중인 게임으로 즉시 이동 ({words.length} 단어 대기 중)
          </button>
        )}
      </div>
    </div>
  );
}
