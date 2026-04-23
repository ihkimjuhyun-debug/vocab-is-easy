'use client';
import { useState } from 'react';

// 단어 데이터 타입 정의
interface Word {
  en: string;
  ko: string;
  pos: string;
  phonetics: string;
}

export default function App() {
  // --- 상태 관리 (State) ---
  const [inputText, setInputText] = useState(''); // 유저가 붙여넣은 텍스트
  const [isLoading, setIsLoading] = useState(false); // 로딩 상태
  const [wordsQueue, setWordsQueue] = useState<Word[]>([]); // 게임에 쓰일 단어 리스트
  const [userInput, setUserInput] = useState(''); // 게임 중 유저가 입력한 답
  const [mode, setMode] = useState<'EnToKo' | 'KoToEn'>('EnToKo'); // 게임 모드

  // --- 1. AI에게 단어 추출 요청하기 ---
  const handleExtractWords = async () => {
    if (!inputText) return alert('텍스트를 입력해주세요!');
    
    setIsLoading(true);
    try {
      // /api/extract/route.ts 로 데이터 전송
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });
      
      const data = await res.json();
      if (data && data.length > 0) {
        setWordsQueue(data); // 추출된 단어를 큐에 넣고 게임 시작!
      } else {
        alert('추출된 단어가 없습니다.');
      }
    } catch (error) {
      alert('오류가 발생했습니다.');
    }
    setIsLoading(false);
  };

  // --- 2. 게임 정답 체크 로직 ---
  const checkAnswer = () => {
    if (wordsQueue.length === 0) return;
    
    const currentWord = wordsQueue[0];
    const isEnToKo = mode === 'EnToKo';
    const targetAnswer = isEnToKo ? currentWord.ko : currentWord.en;
    
    // 단순 공백 제거 및 포함 여부로 유사도 체크 (90% 어감 맞추기용)
    const cleanUser = userInput.trim().replace(/\s/g, '');
    const cleanTarget = targetAnswer.trim().replace(/\s/g, '');

    if (cleanTarget.includes(cleanUser) && cleanUser.length >= cleanTarget.length * 0.8) {
      // 정답: 큐에서 맨 앞 단어 제거
      alert('✅ 정답입니다!');
      setWordsQueue((prev) => prev.slice(1)); 
    } else {
      // 오답: 큐의 맨 앞 단어를 빼서 맨 뒤로 보냄 (듀오링고 방식)
      alert(`❌ 틀렸습니다! 정답: ${targetAnswer}`);
      setWordsQueue((prev) => {
        const failedWord = prev[0];
        return [...prev.slice(1), failedWord]; 
      });
    }
    setUserInput(''); // 입력창 초기화
  };

  // --- 화면 렌더링 ---

  // 1️⃣ 게임 중이 아닐 때 (메인 화면)
  if (wordsQueue.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-4">🚀 AI 단어 마스터</h1>
        <p className="mb-4">오늘 배운 노트나 표현들을 아래에 통째로 복사 붙여넣기 하세요!</p>
        
        <textarea
          className="w-full h-64 p-4 border rounded-lg mb-4 text-black"
          placeholder="예: congested <- 붐비다&#13;&#10;shrank <- 줄다&#13;&#10;astonishing rate -> 비율적으로 증가했을때..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        
        <button 
          onClick={handleExtractWords} 
          disabled={isLoading}
          className="bg-blue-500 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-600 disabled:bg-gray-400"
        >
          {isLoading ? 'AI가 단어를 추출하는 중... ⏳' : 'AI 단어 생성 및 게임 시작!'}
        </button>
      </div>
    );
  }

  // 2️⃣ 게임 중일 때 (듀오링고 모드)
  const currentWord = wordsQueue[0];

  return (
    <div className="max-w-md mx-auto p-8 flex flex-col items-center mt-10 border rounded-xl shadow-lg">
      <h2 className="text-xl font-bold mb-6">
        {mode === 'EnToKo' ? '뜻을 맞추세요' : '영어 단어를 타이핑하세요'}
      </h2>
      
      <div className="text-center mb-8">
        <div className="text-4xl font-extrabold text-blue-600 mb-2">
          {mode === 'EnToKo' ? currentWord.en : currentWord.ko}
        </div>
        <p className="text-gray-500">
          {currentWord.phonetics} <span className="text-xs bg-gray-200 px-2 py-1 rounded">[{currentWord.pos}]</span>
        </p>
      </div>
      
      <input 
        type="text" 
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
        className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-black text-center"
        placeholder="정답을 입력하고 엔터를 누르세요"
        autoFocus
      />
      
      <div className="flex gap-2 w-full">
        <button onClick={checkAnswer} className="flex-1 bg-green-500 text-white py-3 rounded-lg font-bold">
          확인
        </button>
        <button 
          onClick={() => setMode(mode === 'EnToKo' ? 'KoToEn' : 'EnToKo')} 
          className="bg-gray-200 text-gray-700 px-4 rounded-lg text-sm"
        >
          모드 전환
        </button>
      </div>
      
      <p className="mt-6 text-sm text-gray-400">
        남은 단어: {wordsQueue.length}개
      </p>
    </div>
  );
}
